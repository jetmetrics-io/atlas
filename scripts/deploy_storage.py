#!/usr/bin/env python3
"""Деплой Атласа в Яндекс Object Storage (бакет jetmetrics-static).

Сборка ОДНА, заливается под префикс atlas/. Гейт полной версии — внутри приложения
по факту оплаты (email ∈ paid.json), а не по отдельному «секретному» адресу. Данные
(data/atlas_free.json, data/atlas_full.json) кладутся в тот же префикс и грузятся
приложением по fetch: full — только оплатившим.

Каждый объект: ACL=public-read; js/css/шрифты — max-age=1год immutable, html/json — короткий.
Публичность — на ОБЪЕКТ (роли storage.editor хватает), бакет не трогаем.
Адреса всегда с index.html: у бакета нет website-конфигурации, «папочный» /atlas/ = 404.

Ключи: env YC_KEY_ID / YC_SECRET, либо файл app/.deploy.env (см. .deploy.env.example).

Запуск (из app/):
  python3 scripts/deploy_storage.py            # собрать + залить + проверить
  python3 scripts/deploy_storage.py --dry-run  # собрать и показать что зальётся, без заливки
  python3 scripts/deploy_storage.py --no-build # залить уже собранный dist/ (для отладки)
"""
import os, sys, subprocess, pathlib, urllib.request

APP = pathlib.Path(__file__).resolve().parent.parent          # .../Map Library 2.0/app
ENDPOINT = "https://storage.yandexcloud.net"
BUCKET   = "jetmetrics-static"
REGION   = "ru-central1"
PREFIX   = "atlas/"                                            # единственный префикс сборки
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
    if key.endswith(".html") or key.endswith(".json"):
        return "max-age=300"   # данные и html — короткий кэш (обновляемся часто)
    if "/assets/" in key or key.rsplit(".", 1)[-1] in ("js", "css", "woff", "woff2", "ttf"):
        return "max-age=31536000, immutable"
    return "max-age=3600"

def build():
    print("── npm run build ──")
    subprocess.run(["npm", "run", "build"], cwd=APP, check=True)

def upload(cl, dry):
    dist = APP / "dist"
    if not dist.exists():
        sys.exit(f"✖ Нет {dist} — сборка не выполнена.")
    files = sorted(p for p in dist.rglob("*") if p.is_file())
    for p in files:
        key = PREFIX + p.relative_to(dist).as_posix()
        ct = CT.get(p.suffix.lower(), "application/octet-stream")
        cc = cache_for(key)
        print(f"  {'DRY ' if dry else 'PUT '}{key}   [{ct.split(';')[0]}; {cc}]")
        if not dry:
            cl.put_object(Bucket=BUCKET, Key=key, Body=p.read_bytes(),
                          ACL="public-read", ContentType=ct, CacheControl=cc)
    return len(files)

def verify():
    url = f"{ENDPOINT}/{BUCKET}/{PREFIX}index.html"
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
    cl = None if dry else client()          # dry-run не требует ключей
    print(f"=== ATLAS → {PREFIX} ===")
    if not no_build:
        build()
    total = upload(cl, dry)
    print(f"\n{'(dry-run) ' if dry else ''}Объектов: {total}")
    if not dry:
        print("\n=== Проверка живьём ===")
        verify()
        print("\nГотово. В Тильде iframe адресует ...index.html (не «папку»). "
              "После правок — Publish и проверка с ?v=<timestamp> (кэш агрессивный).")

if __name__ == "__main__":
    main()
