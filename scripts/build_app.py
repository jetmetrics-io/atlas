#!/usr/bin/env python3
"""Собрать выгрузку приложения из Базы: db/atlas.db → public/data/*.json

    python3 scripts/build_app.py [--db <путь>] [--out <папка>] [--check <эталон>]

Четыре файла на выходе:

| Файл                | Что внутри                                                |
|---------------------|-----------------------------------------------------------|
| `atlas_full.json`   | весь граф: узлы, связи, каталог                           |
| `atlas_free.json`   | тот же каталог целиком, но узлы только бесплатных карт    |
| `content_full.json` | карточки всех метрик                                      |
| `content_free.json` | карточки метрик из бесплатных карт                        |

⛔ **Каталог одинаков в обеих выгрузках.** В `families`, `sections` и `trees`
перечислены ВСЕ артефакты, платные тоже: неоплативший должен видеть их в каталоге
с замком, а не пустое место (решение Дмитрия, `site-state/atlas/артефакты.md`
§ «Доступ и публикация в каталоге»). Урезаются только `nodes` и `edges` —
то есть содержимое, а не витрина.

## Правила, которых нет в самой Базе

Выведены сверкой с боевой выгрузкой 22.09.2026, совпадение по 949 узлам,
974 связям и 949 карточкам. Менять их нельзя, не сверившись с боем заново.

1. **Порядок записей.** `nodes` — по `metric_artifact.id`, `edges` — по
   `metric_metric.id`, `families` — по `family.sort`, `sections` и `trees` —
   по имени. Порядок держит diff выгрузки читаемым: правка одной метрики
   не должна перетасовывать файл.
2. **Пустые поля опускаются.** У узлов дерева нет `x`, `w`, `h` и `group`:
   раскладку дерева считает приложение, из Базы ему нужен только порядок `y`.
3. **`style` по умолчанию `solid`.** В Базе он пуст у 175 связей.
4. **Формула с альтернативой** склеивается как `А<br> ИЛИ<br> Б` (20 метрик).
5. **`parent` у дерева** вычисляется: родитель — то дерево, где корневая метрика
   этого дерева стоит обычным узлом. В Базе поля `parent` нет.
6. **`total` у дерева** — число уникальных метрик в нём и во всех его потомках.
   У «Чистой прибыли» это 170 при 12 собственных местах: за её плашкой в каталоге
   открывается весь разбор из девяти деревьев.
7. **`cross_section`** всегда `false` — поле осталось от старой модели карт.
"""
import argparse, json, pathlib, sqlite3, datetime, sys

KORNI = pathlib.Path(__file__).resolve().parent.parent      # папка app/

# Шапка выгрузки. Это не данные, а подпись под ними: откуда взяты и как читать.
LEGENDA = {
    "solid":   "влияние (impact)",
    "dashed":  "связь без влияния (ассоциация)",
    "green_+": "прямое (рост→рост)",
    "red_-":   "обратное (рост→спад)",
}
ROLI = {
    "action":     "Действие (управляемая)",
    "result":     "Результат",
    "diagnostic": "Диагностика",
    "cost":       "Затраты",
}
PROVENANCE = "atlas-authored — принято «как есть» (истина ручной разметки, подлежит доработке)"
ISTOCHNIK  = "content/db/atlas.db"   # историческое значение, читается людьми в meta

# Поля карточки: как называется в выгрузке ← как называется в Базе.
KARTOCHKA = [
    ("EN",               "en"),
    ("Синонимы",         "synonyms"),
    ("Описание",         "description"),
    ("Нюансы расчёта",   "nuances"),
    ("Пример расчёта",   "example"),
    ("Важность",         "importance"),
    ("Когда не нужна",   "not_needed"),
    ("Суть",             "essence"),
    ("Суть · пояснение", "essence_note"),
]


def sobrat_uzly(con):
    """Узлы в порядке metric_artifact.id — пустые поля не пишем."""
    q = """select pa.id, pa.node_id, pa.metric_id, m.name, a.name section, pa.role,
                  pa.x, pa.y, pa.w, pa.h, pa."group" grp, pa.label_text, pa.is_key,
                  m.formula, m.alt_formula, m.description, m.unit
           from metric_artifact pa
           join metric m   on m.id = pa.metric_id
           join artifact a on a.id = pa.artifact_id
           order by pa.id"""
    uzly = []
    for r in con.execute(q):
        u = {"id": r["node_id"], "mid": r["metric_id"], "name": r["name"],
             "section": r["section"], "role": r["role"]}
        # порядок ключей тот же, что в боевой выгрузке: геометрия, метка, тексты
        for klyuch, znach in (("x", r["x"]), ("y", r["y"]), ("w", r["w"]), ("h", r["h"])):
            if znach is not None:
                u[klyuch] = znach
        if r["label_text"]:
            u["label"] = r["label_text"]
        if r["formula"]:
            # В узле — только основная формула: на карте она подпись под именем,
            # и «А ИЛИ Б» туда не влезает. Оба способа расчёта показывает карточка.
            u["formula"] = r["formula"]
        if r["description"]:
            u["description"] = r["description"]
        if r["unit"]:
            u["units"] = r["unit"]
        if r["is_key"]:
            # ключевая метрика артефакта: на карте с ореолом, в дереве — корень
            u["key"] = True
        if r["grp"]:
            u["group"] = r["grp"]
        uzly.append(u)
    return uzly


def formula_celikom(osnovnaya, alternativa):
    """Метрику иногда считают двумя способами — показываем оба."""
    osn = (osnovnaya or "").strip()
    alt = (alternativa or "").strip()
    return f"{osn}<br> ИЛИ<br> {alt}" if alt else osn


def sobrat_svyazi(con):
    """Связи в порядке metric_metric.id."""
    q = """select e.id, ps.node_id istok, pt.node_id cel, e.sign, e.style, e.type, e.points
           from metric_metric e
           join metric_artifact ps on ps.id = e.source_id
           join metric_artifact pt on pt.id = e.target_id
           order by e.id"""
    svyazi = []
    for r in con.execute(q):
        s = {"source": r["istok"], "target": r["cel"], "sign": r["sign"],
             "style": r["style"] or "solid", "kind": r["type"], "cross_section": False}
        if r["points"]:
            s["points"] = json.loads(r["points"])
        svyazi.append(s)
    return svyazi


def sobrat_katalog(con, uzly_po_artefaktu):
    """Семьи с артефактами, список карт и список деревьев — всё, что видно в каталоге."""
    semyi = []
    for f in con.execute("select id, key, name, accent, blurb from family order by sort, id"):
        punkty = []
        for a in con.execute("""select name, slug, type, access, id from artifact
                                where family_id=? order by name""", (f["id"],)):
            punkt = {"name": a["name"], "slug": a["slug"], "type": a["type"],
                     "access": a["access"], "nodes": uzly_po_artefaktu.get(a["id"], 0)}
            if a["type"] == "tree":
                # у дерева в каталоге подписан весь разбор, а не одна его ступень
                punkt["total"] = vsego_metrik(con, a["id"])
            punkty.append(punkt)
        semyi.append({"key": f["key"], "title": f["name"], "accent": f["accent"],
                      "blurb": f["blurb"], "items": punkty})

    karty = [{"name": a["name"], "slug": a["slug"], "nodes": uzly_po_artefaktu.get(a["id"], 0)}
             for a in con.execute("select id, name, slug from artifact where type='map' order by name")]

    derevya = []
    for a in con.execute("select id, name, slug, purpose from artifact where type='tree' order by name"):
        koren = con.execute("""select node_id from metric_artifact
                               where artifact_id=? and is_key=1""", (a["id"],)).fetchone()
        derevya.append({
            "name": a["name"], "slug": a["slug"], "nodes": uzly_po_artefaktu.get(a["id"], 0),
            "root": koren["node_id"] if koren else None,
            "purpose": a["purpose"],
            "parent": roditel(con, a["id"], a["slug"]),
            "total": vsego_metrik(con, a["id"]),
        })
    return semyi, karty, derevya


def roditel(con, artefakt_id, slug):
    """Родитель дерева — то дерево, где его корневая метрика стоит обычным узлом.

    Своего поля в Базе нет: родство задаётся самой разметкой. «Выручка» — ребёнок
    «Чистой прибыли» именно потому, что выручка стоит в разборе прибыли компонентом.
    """
    koren = con.execute("""select metric_id from metric_artifact
                           where artifact_id=? and is_key=1""", (artefakt_id,)).fetchone()
    if not koren:
        return None
    r = con.execute("""select a.slug from metric_artifact pa
                       join artifact a on a.id = pa.artifact_id
                       where pa.metric_id=? and a.type='tree' and a.slug<>? and pa.is_key=0
                       order by a.id limit 1""", (koren["metric_id"], slug)).fetchone()
    return r["slug"] if r else None


def vsego_metrik(con, artefakt_id):
    """Уникальные метрики дерева вместе со всеми его потомками.

    В каталоге под плашкой подписано именно это число: читатель проваливается
    из верхнего дерева в дочерние, и ему обещан весь разбор, а не одна ступень.
    """
    svoi = {artefakt_id}
    volna = {artefakt_id}
    while volna:
        deti = set()
        for rodit in volna:
            koren = con.execute("""select metric_id from metric_artifact
                                   where artifact_id=? and is_key=1""", (rodit,)).fetchone()
            if not koren:
                continue
            for r in con.execute("""select distinct a.id from artifact a
                                    join metric_artifact pa on pa.artifact_id=a.id and pa.is_key=1
                                    join metric_artifact rodit on rodit.metric_id=pa.metric_id
                                    where a.type='tree' and rodit.artifact_id=? and rodit.is_key=0""",
                                 (rodit,)):
                if r["id"] not in svoi:
                    deti.add(r["id"])
        svoi |= deti
        volna = deti
    mesta = ",".join("?" * len(svoi))
    return con.execute(f"""select count(distinct metric_id) from metric_artifact
                           where artifact_id in ({mesta})""", tuple(svoi)).fetchone()[0]


def sobrat_kartochki(con, node_ids):
    """Карточка метрики — одна на все её места: текст описывает метрику, а не место."""
    razrezy = {}
    for r in con.execute("""select md.metric_id, d.name, md.note from metric_dimension md
                            join dimension d on d.id = md.dimension_id
                            order by md.metric_id, md.priority, d.name"""):
        razrezy.setdefault(r["metric_id"], []).append({"name": r["name"], "note": r["note"] or ""})

    metriki = {r["id"]: dict(r) for r in con.execute("select * from metric")}
    karty = {}
    for node_id, mid in node_ids:
        m = metriki.get(mid)
        if not m:
            continue
        k = {}
        for imya, pole in KARTOCHKA:
            if m[pole]:
                k[imya] = m[pole]
        if m["formula"]:
            k["Формула"] = formula_celikom(m["formula"], m["alt_formula"])
        if mid in razrezy:
            k["Разрезы"] = razrezy[mid]
        karty[node_id] = k
    return karty


def zapisat(put, dannye):
    """Одной строкой, юникод как есть — так собран бой, так читается diff."""
    put.write_text(json.dumps(dannye, ensure_ascii=False), encoding="utf-8")
    return put.stat().st_size


def sobrat(db_put, out_put, data_segodnya=None):
    con = sqlite3.connect(db_put)
    con.row_factory = sqlite3.Row

    uzly_po_artefaktu = {r["artifact_id"]: r["n"] for r in con.execute(
        "select artifact_id, count(*) n from metric_artifact group by artifact_id")}
    besplatnye = [r["id"] for r in con.execute("select id from artifact where access='free' order by id")]
    imena_besplatnyh = [r["name"] for r in con.execute(
        "select name from artifact where access='free' order by id")]

    uzly   = sobrat_uzly(con)
    svyazi = sobrat_svyazi(con)
    semyi, karty, derevya = sobrat_katalog(con, uzly_po_artefaktu)

    # что попадает в бесплатную выгрузку: места бесплатных артефактов
    mesta_free = {r["node_id"] for r in con.execute(
        f"""select node_id from metric_artifact
            where artifact_id in ({",".join("?" * len(besplatnye))})""", besplatnye)}
    uzly_free   = [u for u in uzly if u["id"] in mesta_free]
    svyazi_free = [s for s in svyazi if s["source"] in mesta_free and s["target"] in mesta_free]

    data = data_segodnya or datetime.date.today().isoformat()

    def shapka(u, s):
        return {"source": ISTOCHNIK, "provenance": PROVENANCE, "legend": LEGENDA, "roles": ROLI,
                "updated": data, "nodes": len(u), "metrics": len({x["mid"] for x in u}),
                "edges": len(s), "sections": len(karty), "trees": len(derevya),
                "freeSections": imena_besplatnyh}

    out = pathlib.Path(out_put)
    out.mkdir(parents=True, exist_ok=True)
    itog = {}
    itog["atlas_full.json"] = zapisat(out / "atlas_full.json", {
        "meta": shapka(uzly, svyazi), "families": semyi, "sections": karty,
        "trees": derevya, "nodes": uzly, "edges": svyazi})
    itog["atlas_free.json"] = zapisat(out / "atlas_free.json", {
        "meta": shapka(uzly_free, svyazi_free), "families": semyi, "sections": karty,
        "trees": derevya, "nodes": uzly_free, "edges": svyazi_free})

    vse_mesta   = [(u["id"], u["mid"]) for u in uzly]
    free_mesta  = [(u["id"], u["mid"]) for u in uzly_free]
    itog["content_full.json"] = zapisat(out / "content_full.json", sobrat_kartochki(con, vse_mesta))
    itog["content_free.json"] = zapisat(out / "content_free.json", sobrat_kartochki(con, free_mesta))

    print(f"── Выгрузка собрана из {db_put} ──")
    print(f"   узлов {len(uzly)} · метрик {len({u['mid'] for u in uzly})} · связей {len(svyazi)}"
          f" · карт {len(karty)} · деревьев {len(derevya)}")
    print(f"   бесплатных: узлов {len(uzly_free)} · связей {len(svyazi_free)}")
    for imya, razmer in itog.items():
        print(f"   {imya:<20} {razmer:>9,} байт".replace(",", " "))
    return itog


def sverit(nash, etalon):
    """Сравнить свежесобранное с эталонной выгрузкой — поле за полем."""
    nash, etalon = pathlib.Path(nash), pathlib.Path(etalon)
    rashozhdeniy = 0
    for imya in ("atlas_full.json", "atlas_free.json", "content_full.json", "content_free.json"):
        a, b = nash / imya, etalon / imya
        if not b.exists():
            print(f"  — {imya}: эталона нет, пропускаю")
            continue
        da, db_ = json.loads(a.read_text(encoding="utf-8")), json.loads(b.read_text(encoding="utf-8"))
        raznica = sravnit(da, db_, imya)
        rashozhdeniy += len(raznica)
        if raznica:
            print(f"  ⚠️ {imya}: расхождений {len(raznica)}")
            for r in raznica[:12]:
                print(f"       {r}")
        else:
            print(f"  ✅ {imya}: совпадает")
    return rashozhdeniy


def sravnit(a, b, put, glubina=0):
    """Рекурсивное сравнение с понятным адресом расхождения."""
    if glubina > 6:
        return []
    if type(a) is not type(b):
        return [f"{put}: типы разные ({type(a).__name__} / {type(b).__name__})"]
    if isinstance(a, dict):
        out = []
        for k in sorted(set(a) | set(b)):
            if k not in a:
                out.append(f"{put}.{k}: нет у нас")
            elif k not in b:
                out.append(f"{put}.{k}: нет в эталоне")
            else:
                out += sravnit(a[k], b[k], f"{put}.{k}", glubina + 1)
            if len(out) > 40:
                break
        return out
    if isinstance(a, list):
        if len(a) != len(b):
            return [f"{put}: длина {len(a)} против {len(b)}"]
        out = []
        for i, (x, y) in enumerate(zip(a, b)):
            out += sravnit(x, y, f"{put}[{i}]", glubina + 1)
            if len(out) > 40:
                break
        return out
    if isinstance(a, float) and isinstance(b, float):
        return [] if abs(a - b) < 0.05 else [f"{put}: {a} против {b}"]
    return [] if a == b else [f"{put}: {str(a)[:60]!r} против {str(b)[:60]!r}"]


def main():
    p = argparse.ArgumentParser(description="Собрать выгрузку приложения из Базы")
    p.add_argument("--db",   default=str(KORNI / "db" / "atlas.db"))
    p.add_argument("--out",  default=str(KORNI / "public" / "data"))
    p.add_argument("--check", help="папка с эталонной выгрузкой — сверить и не трогать бой")
    p.add_argument("--date", help="дата в meta.updated (по умолчанию сегодня)")
    a = p.parse_args()

    if not pathlib.Path(a.db).exists():
        # База — производное от дампа, а не то, что надо искать руками.
        # Так сборка работает и на чистом клоне, и в CI: там базы нет никогда.
        damp = KORNI / "db" / "atlas.sql"
        if pathlib.Path(a.db) == KORNI / "db" / "atlas.db" and damp.exists():
            print("── Базы нет, собираю из дампа ──")
            import subprocess
            subprocess.run([sys.executable, str(KORNI / "scripts" / "db.py"), "restore"], check=True)
        else:
            sys.exit(f"✖ Базы нет: {a.db}\n"
                     f"  Собрать из дампа: python3 scripts/db.py restore")
    sobrat(a.db, a.out, a.date)
    if a.check:
        print(f"── Сверка с эталоном {a.check} ──")
        n = sverit(a.out, a.check)
        print("Сверка: чисто" if n == 0 else f"Сверка: расхождений {n}")
        sys.exit(1 if n else 0)


if __name__ == "__main__":
    main()
