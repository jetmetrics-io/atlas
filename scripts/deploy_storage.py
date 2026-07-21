#!/usr/bin/env python3
"""Деплой атласа в Яндекс Object Storage (бакет jetmetrics-static).

Собирает обе версии и заливает под их префиксы:
  free  → atlas/                    (3 карты: Финансы, Лидогенерация, Поддержка клиентов)
  full  → atlas/pro-3c35f475c4/     (все 28 карт — закрытая, «pro»-префикс = пейволл)

Каждый объект: ACL=public-read; js/css/шрифты — max-age=1год immutable, html — max-age=300.
Публичность — на ОБЪЕКТ (роли storage.editor хватает), бакет не трогаем.
Адреса всегда с index.html: у бакета нет website-конфигурации, «папочный» /atlas/ = 404.

Ключи: env YC_KEY_ID / YC_SECRET, либо файл app/.deploy.env (см. .deploy.env.example).

Запуск (из app/):
  python3 scripts/deploy_storage.py              # собрать + залить обе версии + проверить
  python3 scripts/deploy_storage.py --free-only  # только free
  python3 scripts/deploy_storage.py --full-only  # только full
  python3 scripts/deploy_storage.py --dry-run    # собрать и показать что зальётся, без заливки
  python3 scripts/deploy_storage.py --no-build    # залить уже собранный dist/ (для отладки)
"""
import os, sys, subprocess, pathlib, urllib.request

APP = pathlib.Path(__file__).resolve().parent.parent          # .../Map Library 2.0/app
ENDPOINT = "https://storage.yandexcloud.net"
BUCKET   = "jetmetrics-static"
REGION   = "ru-central1"
TIERS = {                                                     # tier → (npm-скрипт, префикс в бакете)
    "free": ("build:free", "atlas/"),
    "full": ("build:full", "atlas/pro-3c35f475c4/"),
}
CT = {  # content-type по расширению (mimetypes не знает woff2 и врёт про js)
    ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".webp": "image/webp", ".ico": "image/x-icon", ".woff2": "font/woff2", ".woff": "font/woff",
    ".ttf": "font/ttf", ".map": "application/json", ".txt": "text/plain; charset=utf-8",
}

def load_env():
    f = APP / ".deploy.env"
    if f.exists():
        for line in f.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

def client():
    import boto3
    kid, sec = os.environ.get("YC_KEY_ID"), os.environ.get("YC_SECRET")
    if not kid or not sec:
        sys.exit("✖ Нет ключей. Задай YC_KEY_ID / YC_SECRET в env или в app/.deploy.env "
                 "(скопируй .deploy.env.example). Ключи — консоль Яндекса, аккаунт static-deploy.")
    return boto3.client("s3", endpoint_url=ENDPOINT, region_name=REGION,
                        aws_access_key_id=kid, aws_secret_access_key=sec)

def cache_for(key):
    if key.endswith(".html"):
        return "max-age=300"
    if "/assets/" in key or key.rsplit(".", 1)[-1] in ("js", "css", "woff", "woff2", "ttf"):
        return "max-age=31536000, immutable"
    return "max-age=3600"

def build(tier):
    script = TIERS[tier][0]
    print(f"── npm run {script} ──")
    subprocess.run(["npm", "run", script], cwd=APP, check=True)

def upload(cl, prefix, dry):
    dist = APP / "dist"
    if not dist.exists():
        sys.exit(f"✖ Нет {dist} — сборка не выполнена.")
    files = sorted(p for p in dist.rglob("*") if p.is_file())
    for p in files:
        key = prefix + p.relative_to(dist).as_posix()
        ct = CT.get(p.suffix.lower(), "application/octet-stream")
        cc = cache_for(key)
        print(f"  {'DRY ' if dry else 'PUT '}{key}   [{ct.split(';')[0]}; {cc}]")
        if not dry:
            cl.put_object(Bucket=BUCKET, Key=key, Body=p.read_bytes(),
                          ACL="public-read", ContentType=ct, CacheControl=cc)
    return len(files)

def verify(prefix):
    url = f"{ENDPOINT}/{BUCKET}/{prefix}index.html"
    try:
        with urllib.request.urlopen(url, timeout=15) as r:
            body = r.read().decode("utf-8", "replace")
        stale = [s for s in ("github.io", "googleapis", "gstatic") if s in body]
        print(f"  ✓ {url} → {r.status}" + (f"  ⚠ найдено: {stale}" if stale else ""))
    except Exception as e:
        print(f"  ✖ {url} → {e}")

def main():
    load_env()
    args = set(sys.argv[1:])
    dry = "--dry-run" in args
    no_build = "--no-build" in args
    tiers = [t for t in ("free", "full")
             if not (t == "free" and "--full-only" in args) and not (t == "full" and "--free-only" in args)]
    cl = None if dry else client()          # dry-run не требует ключей
    total = 0
    for t in tiers:
        prefix = TIERS[t][1]
        print(f"\n=== {t.upper()} → {prefix} ===")
        if not no_build:
            build(t)
        total += upload(cl, prefix, dry)
    print(f"\n{'(dry-run) ' if dry else ''}Объектов: {total}")
    if not dry:
        print("\n=== Проверка живьём ===")
        for t in tiers:
            verify(TIERS[t][1])
        print("\nГотово. В Тильде iframe адресует ...index.html (не «папку»). "
              "После правок — Publish и проверка с ?v=<timestamp> (кэш агрессивный).")

if __name__ == "__main__":
    main()
