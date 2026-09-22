#!/usr/bin/env python3
"""База Атласа: восстановить из дампа, снять дамп, проверить.

    python3 scripts/db.py restore   # db/atlas.sql → db/atlas.db   (после git pull)
    python3 scripts/db.py dump      # db/atlas.db  → db/atlas.sql  (перед git commit)
    python3 scripts/db.py check     # целостность + не разошлись ли дамп и база

## Зачем дамп, а не сам файл базы

В репозитории лежит **текстовый дамп** `db/atlas.sql`, а рабочая `db/atlas.db`
из него собирается и в git не попадает. Так сделано ради двух вещей:

* **Правки видно.** В `git diff` читается, какая метрика изменилась и как.
  Двоичный `.db` показал бы «файл изменился» — и всё.
* **Конфликты всплывают.** Если двое правили Базу параллельно, git скажет об этом
  при слиянии. Две копии двоичного файла просто затрут друг друга, и чья-то работа
  исчезнет молча — ровно это и случилось 22.09.2026, когда копий Базы стало две.

## Порядок работы

    git pull && python3 scripts/db.py restore    # получить чужие правки
    …правки Базы (миграцией из db/migrations/)…
    python3 scripts/db.py dump                   # уложить свои
    git add db/atlas.sql && git commit && git push

Миграции в `db/migrations/` — это история и способ внести правку, а не то, что
нужно прогонять после каждого `pull`: их результат уже лежит в дампе.
"""
import subprocess, sys, pathlib, sqlite3, argparse, datetime, shutil

KORNI = pathlib.Path(__file__).resolve().parent.parent
BAZA  = KORNI / "db" / "atlas.db"
DAMP  = KORNI / "db" / "atlas.sql"


def restore(force=False):
    if not DAMP.exists():
        sys.exit(f"✖ Нет дампа {DAMP} — сделать `git pull`")
    if BAZA.exists():
        if not force:
            # не затираем молча: вдруг в рабочей базе есть незалитые правки
            svezhee = BAZA.stat().st_mtime > DAMP.stat().st_mtime
            if svezhee:
                print(f"⚠️  {BAZA.name} новее дампа — в ней могут быть правки, которых нет в git.")
                print(f"   Сохранить их:   python3 scripts/db.py dump")
                print(f"   Затереть базу:  python3 scripts/db.py restore --force")
                sys.exit(1)
        kopiya = BAZA.with_suffix(f".before_restore_{datetime.datetime.now():%Y%m%d_%H%M%S}.db")
        shutil.copy(BAZA, kopiya)
        print(f"бэкап прежней базы: {kopiya.name}")
        BAZA.unlink()
    BAZA.parent.mkdir(parents=True, exist_ok=True)
    with open(DAMP, encoding="utf-8") as f:
        subprocess.run(["sqlite3", str(BAZA)], stdin=f, check=True)
    print(f"✓ База собрана из дампа: {BAZA}")
    svodka()


def dump():
    if not BAZA.exists():
        sys.exit(f"✖ Нет базы {BAZA} — собрать: python3 scripts/db.py restore")
    pretenzii = celostnost()
    if pretenzii:
        print("✖ Дамп не снят: база не прошла проверку целостности")
        for p in pretenzii:
            print("   " + p)
        sys.exit(1)
    with open(DAMP, "w", encoding="utf-8") as f:
        subprocess.run(["sqlite3", str(BAZA), ".dump"], stdout=f, check=True)
    print(f"✓ Дамп снят: {DAMP} ({DAMP.stat().st_size/1024/1024:.1f} МБ)")
    print("  дальше: git add db/atlas.sql && git commit && git push")


def celostnost():
    con = sqlite3.connect(BAZA)
    pretenzii = []
    if con.execute("pragma integrity_check").fetchone()[0] != "ok":
        pretenzii.append("⛔ integrity_check не ok")
    # места без метрики или без артефакта — выгрузка на таких падает
    siroty = con.execute("""select count(*) from metric_artifact pa
                            left join metric m on m.id=pa.metric_id
                            left join artifact a on a.id=pa.artifact_id
                            where m.id is null or a.id is null""").fetchone()[0]
    if siroty:
        pretenzii.append(f"⛔ мест без метрики или артефакта: {siroty}")
    # связи, у которых нет конца
    obryv = con.execute("""select count(*) from metric_metric e
                           left join metric_artifact s on s.id=e.source_id
                           left join metric_artifact t on t.id=e.target_id
                           where s.id is null or t.id is null""").fetchone()[0]
    if obryv:
        pretenzii.append(f"⛔ связей с оборванным концом: {obryv}")
    # у артефакта должна быть ровно одна ключевая метрика
    for r in con.execute("""select a.name, count(*) n from artifact a
                            join metric_artifact pa on pa.artifact_id=a.id and pa.is_key=1
                            group by a.id having n>1"""):
        pretenzii.append(f"⛔ у «{r[0]}» ключевых метрик: {r[1]}")
    con.close()
    return pretenzii


def svodka():
    con = sqlite3.connect(BAZA)
    schet = lambda zapros, *p: con.execute(zapros, p).fetchone()[0]
    metrik   = schet("select count(*) from metric")
    mest     = schet("select count(*) from metric_artifact")
    svyazey  = schet("select count(*) from metric_metric")
    kart     = schet("select count(*) from artifact where type=?", "map")
    derevyev = schet("select count(*) from artifact where type=?", "tree")
    print(f"   метрик {metrik} · мест {mest} · связей {svyazey}"
          f" · карт {kart} · деревьев {derevyev}")
    con.close()


def check():
    if not BAZA.exists():
        sys.exit(f"✖ Нет базы {BAZA} — собрать: python3 scripts/db.py restore")
    pretenzii = celostnost()
    for p in pretenzii:
        print(p)
    print("целостность: чисто" if not pretenzii else f"целостность: претензий {len(pretenzii)}")
    svodka()
    # не разошлись ли дамп и рабочая база
    vremenno = BAZA.with_suffix(".check.sql")
    with open(vremenno, "w", encoding="utf-8") as f:
        subprocess.run(["sqlite3", str(BAZA), ".dump"], stdout=f, check=True)
    odinakovo = DAMP.exists() and vremenno.read_text(encoding="utf-8") == DAMP.read_text(encoding="utf-8")
    vremenno.unlink()
    print("дамп и база: совпадают" if odinakovo else
          "⚠️ дамп и база РАЗОШЛИСЬ — снять дамп: python3 scripts/db.py dump")
    return 0 if (not pretenzii and odinakovo) else 1


def main():
    p = argparse.ArgumentParser(description="База Атласа: дамп, восстановление, проверка")
    p.add_argument("komanda", choices=["restore", "dump", "check"])
    p.add_argument("--force", action="store_true", help="restore: затереть рабочую базу без вопросов")
    a = p.parse_args()
    if a.komanda == "restore":
        restore(a.force)
    elif a.komanda == "dump":
        dump()
    else:
        sys.exit(check())


if __name__ == "__main__":
    main()
