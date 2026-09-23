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
  python3 scripts/deploy_storage.py              # сверить с боем + собрать + залить + проверить
  python3 scripts/deploy_storage.py --dry-run    # показать что уедет, ничего не заливая
  python3 scripts/deploy_storage.py --no-build   # залить уже собранный dist/ (для отладки)
  python3 scripts/deploy_storage.py --yes        # не спрашивать подтверждения (для CI)
  python3 scripts/deploy_storage.py --rollback .rollback  # вернуть прежний бой из слепка

Перед каждой выкладкой скрипт сам:
  1) тянет бой и показывает, что изменится (scripts/atlas_pull.py);
  2) сохраняет слепок боя в .rollback/ — чтобы откат был всегда, а не когда повезёт;
  3) останавливается, если из боя пропадают артефакты или метрики, пока не скажешь --yes.
"""
import os, sys, json, datetime, subprocess, pathlib, urllib.request

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
    """Сборка: выгрузка из Базы, типы, бандл.

    Раньше здесь был один `npm run build`, и он утаскивал за собой `npm run gen`,
    который до 22.09.2026 звал скрипт с ЧУЖОЙ машины (../content/db/build_app.py).
    Деплой падал у всех, кроме одного человека. Теперь сборщик лежит в репозитории,
    но шаги всё равно разведены: если упадёт сборка выгрузки, это видно сразу,
    а не в куче вывода vite.
    """
    if not (APP / "db" / "atlas.db").exists():
        print("── База не собрана, делаю из дампа ──")
        subprocess.run([sys.executable, "scripts/db.py", "restore"], cwd=APP, check=True)
    print("── Выгрузка из Базы ──")
    subprocess.run([sys.executable, "scripts/build_app.py"], cwd=APP, check=True)
    print("── Типы ──")
    subprocess.run(["npx", "tsc", "--noEmit"], cwd=APP, check=True)
    print("── Сборка приложения ──")
    subprocess.run(["npx", "vite", "build"], cwd=APP, check=True)

# ─────────────────────────── предполёт и откат ───────────────────────────

ROLLBACK = APP / ".rollback"


def predpolyot(dry):
    """Показать, что изменится в бою, и снять слепок для отката.

    Возвращает список тревог. Тревога — это не «нельзя», а «подтверди»: пропажа
    артефакта бывает и намеренной. Молча выкладывать такое нельзя: 22.09.2026
    выкладка прошла с рассинхроном бесплатной выгрузки, и заметили это на сутки позже.
    """
    # 1. Сама выгрузка цела? Это проверяется без сети и должно идти первым:
    #    битую сборку нельзя выкладывать, даже если бой недоступен.
    papka = APP / "dist" / "data"
    if not papka.exists():
        papka = APP / "public" / "data"
    kod = subprocess.run([sys.executable, str(APP / "scripts" / "check_dump.py"), str(papka)]).returncode
    if kod != 0:
        sys.exit("⛔ Выкладка отменена: выгрузка не прошла проверку.")

    print("\n── Предполётная сверка с боем ──")
    try:
        import atlas_pull
    except ImportError:
        sys.path.insert(0, str(APP / "scripts"))
        import atlas_pull

    try:
        tam = atlas_pull.boy()
    except Exception as e:
        print(f"  ⚠️ бой не отвечает ({e}) — сверку пропускаю, слепок НЕ снят")
        return ["⚠️ выкладка без слепка: откатиться будет нечем"]

    if not dry:
        ROLLBACK.mkdir(parents=True, exist_ok=True)
        for f in atlas_pull.FAYLY:
            cel = ROLLBACK / f
            cel.parent.mkdir(parents=True, exist_ok=True)
            soder = tam[f]
            cel.write_text(json.dumps(soder, ensure_ascii=False) if f.endswith(".json") else soder,
                           encoding="utf-8")
        (ROLLBACK / "снято.txt").write_text(
            f"Слепок боя перед выкладкой {datetime.datetime.now():%Y-%m-%d %H:%M}\n"
            f"Откат: python3 scripts/deploy_storage.py --rollback .rollback\n", encoding="utf-8")
        print(f"  слепок боя сохранён: {ROLLBACK.name}/ (откат возможен)")

    tut = atlas_pull.mestnoe(APP / "dist" / "data")
    if not tut:
        tut = atlas_pull.mestnoe(APP / "public" / "data")
    if not tut:
        return ["⛔ нечего выкладывать: выгрузки нет ни в dist/data, ни в public/data"]

    otchet, trevogi = atlas_pull.sravnit(tam, tut)
    for s in otchet:
        print("   " + s)
    for s in trevogi:
        print("   " + s)
    # Беда в текущем бою — повод выложить, а не повод остановиться: выкладка её и чинит.
    # Останавливаемся только из-за того, что не так в НАШЕЙ сборке.
    nashi = [s for s in trevogi if not s.startswith("⚠️ бой:")]
    if len(nashi) < len(trevogi):
        print("   (беды самого боя выкладку не блокируют — она их исправляет)")
    return nashi


def rollback(papka, cl):
    """Вернуть в бой файлы из слепка. Код приложения не трогаем: в assets/ хеши,
    прежний index.html ссылается на прежние бандлы, а они с бакета не удалялись."""
    papka = pathlib.Path(papka)
    if not papka.exists():
        sys.exit(f"✖ Нет слепка {papka}")
    fayly = sorted(f for f in papka.rglob("*") if f.is_file() and f.name != "снято.txt")
    if not fayly:
        sys.exit(f"✖ Слепок {papka} пуст")
    print(f"── Откат из {papka} ──")
    for f in fayly:
        key = PREFIX + f.relative_to(papka).as_posix()
        ct = CT.get(f.suffix.lower(), "application/octet-stream")
        print(f"  PUT {key}   [{ct.split(';')[0]}; {cache_for(key)}]")
        cl.put_object(Bucket=BUCKET, Key=key, Body=f.read_bytes(),
                      ACL="public-read", ContentType=ct, CacheControl=cache_for(key))
    print(f"\nВозвращено объектов: {len(fayly)}")
    verify()


def upload(cl, dry):
    dist = APP / "dist"
    if not dist.exists():
        sys.exit(f"✖ Нет {dist} — сборка не выполнена.")
    files = sorted(p for p in dist.rglob("*") if p.is_file())
    skipped = []
    for p in files:
        key = PREFIX + p.relative_to(dist).as_posix()

        # ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
        # ┃  СПИСКИ ОПЛАТИВШИХ НЕ ВЫГРУЖАЕМ. НИКОГДА.                          ┃
        # ┃                                                                    ┃
        # ┃  Боевой payment/paid.json — это список живых покупателей, его      ┃
        # ┃  ведёт сайт, и лежит он в КОРНЕ бакета. В dist/ же попадает        ┃
        # ┃  локальная заглушка из public/payment/ с парой тестовых адресов:   ┃
        # ┃  она нужна только для отладки на localhost.                        ┃
        # ┃                                                                    ┃
        # ┃  Сейчас пути расходятся (atlas/payment/ против payment/), поэтому  ┃
        # ┃  заглушка боевой список не затирает. Но стоит однажды сменить      ┃
        # ┃  PREFIX или переложить файлы — и деплой молча снесёт всех, кто     ┃
        # ┃  купил Атлас, а узнаем мы об этом от людей, потерявших доступ.     ┃
        # ┃  Поэтому не полагаемся на удачное расположение: не грузим вовсе.   ┃
        # ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
        if "/payment/" in f"/{key}":
            skipped.append(key)
            continue

        ct = CT.get(p.suffix.lower(), "application/octet-stream")
        cc = cache_for(key)
        print(f"  {'DRY ' if dry else 'PUT '}{key}   [{ct.split(';')[0]}; {cc}]")
        if not dry:
            cl.put_object(Bucket=BUCKET, Key=key, Body=p.read_bytes(),
                          ACL="public-read", ContentType=ct, CacheControl=cc)
    if skipped:
        print(f"  — пропущено (списки оплативших, ведёт сайт): {', '.join(skipped)}")
    return len(files) - len(skipped)

def verify():
    url = f"{ENDPOINT}/{BUCKET}/{PREFIX}index.html"
    try:
        with urllib.request.urlopen(url, timeout=15) as r:
            body = r.read().decode("utf-8", "replace")
        stale = [s for s in ("github.io", "googleapis", "gstatic") if s in body]
        print(f"  ✓ {url} → {r.status}" + (f"  ⚠ найдено: {stale}" if stale else ""))
    except Exception as e:
        print(f"  ✖ {url} → {e}")

def guard_prefix():
    """Не дать залить сборку в корень бакета.

    В корне живёт сайт джетметрикс.рф и payment/paid.json со списком покупателей.
    Пустой или укороченный PREFIX означал бы, что сборка Атласа ляжет поверх них.
    Проверка дешёвая, а цена ошибки — сайт и потерянные доступы.
    """
    if not PREFIX.endswith("/") or PREFIX.strip("/") == "":
        sys.exit(f"✖ PREFIX={PREFIX!r} — сборка ушла бы в корень бакета, где лежит сайт "
                 f"и список покупателей. Деплой остановлен.")


def lending(dry: bool):
    """Подтянуть числа на лендинге Атласа — он показывает ту же Базу, что и приложение.

    Лендинг (джетметрикс.рф/atlas) лежит ВНЕ этого репозитория, в `Map Library 2.0/landing/`,
    и заливается отдельным ключом бакета. Стат-строка героя и счётчики карт на нём
    считаются из public/data/atlas_full.json — той самой выгрузки, которую мы только что
    выложили. Пока их правили руками, лендинг отстал от Базы на два месяца: обещал
    745 метрик при 874 и 28 метрик на карте «Финансы» при 39.

    Зовём с --only-numbers: лендинг обновится, только если от боя отличается числами,
    и не увезёт туда чью-то незаконченную правку вёрстки. Нет папки рядом (у кого-то
    другая раскладка воркспейса) — молча пропускаем, Атлас это не ломает.
    """
    skript = APP.parent / "landing" / "deploy_landing.py"
    if not skript.exists():
        print("\n— Лендинга рядом нет (он вне репозитория), числа на нём не трогаю.")
        return
    print("\n=== Лендинг: числа из этой же выгрузки ===", flush=True)
    args = [sys.executable, str(skript), "--only-numbers"] + (["--dry-run"] if dry else [])
    if subprocess.run(args, cwd=skript.parent).returncode != 0:
        print("  ⚠ Лендинг не обновился. Атлас в бою, лендинг залей руками:")
        print("     cd ../landing && python3 deploy_landing.py")


def main():
    load_env()
    guard_prefix()
    args = sys.argv[1:]
    nabor = set(args)
    dry      = "--dry-run" in nabor
    no_build = "--no-build" in nabor
    soglasen = "--yes" in nabor
    cl = None if dry else client()          # dry-run не требует ключей

    if "--rollback" in args:
        i = args.index("--rollback")
        papka = args[i + 1] if len(args) > i + 1 else str(ROLLBACK)
        return rollback(papka, cl)

    print(f"=== ATLAS → {PREFIX} ===")
    if not no_build:
        build()

    trevogi = predpolyot(dry)
    if trevogi and not dry and not soglasen:
        print("\n⛔ Выкладка остановлена: см. предупреждения выше.")
        print("   Если так и задумано — повторить с ключом --yes")
        return 1

    total = upload(cl, dry)
    print(f"\n{'(dry-run) ' if dry else ''}Объектов: {total}")
    if not dry:
        print("\n=== Проверка живьём ===")
        verify()
        print(f"   откат, если что: python3 scripts/deploy_storage.py --rollback {ROLLBACK.name}")
        print("\nГотово. В Тильде iframe адресует ...index.html (не «папку»). "
              "После правок — Publish и проверка с ?v=<timestamp> (кэш агрессивный).")
    lending(dry)

if __name__ == "__main__":
    main()
