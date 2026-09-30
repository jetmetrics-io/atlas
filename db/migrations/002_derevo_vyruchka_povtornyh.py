#!/usr/bin/env python3
"""Миграция 002 — дерево «Выручка с повторных клиентов» в базу.

Зачем. Дерево собрано 21–22.09 скриптом `atlas_tree_import.py`, но он пишет только
в выгрузку приложения (`app/public/data/*.json`) и базу не открывает вообще. Поэтому
дерево, метрика 927 и переименование 159/697 жили в выгрузке в единственном экземпляре:
первая же пересборка из базы стёрла бы их.

Что вносит:
  1. Артефакт дерева (type='tree', access='paid', семья «Клиенты и удержание»)
  2. 15 мест в metric_artifact — роли key/component/driver, порядок веток через y
  3. Срез у 10 мест: label_dimension_id=«Новый или повторный», label_value='повторный'
     ⛔ Значение берётся из dimension.variants ДОСЛОВНО (правило миграции 001).
     Подпись «По повторным клиентам», которая видна на стенде, задаётся спекой дерева
     и формируется при сборке выгрузки — в базе её нет и быть не должно.
  4. 14 связей influence со знаками
  5. Переименование mid 159 и 697: «Средняя цена товара» → «Средняя цена за единицу
     товара». Имя противоречило собственной формуле «Выручка / Количество проданных
     единиц»: знаменатель в единицах, а имя про товар (RULES.md § «Сверять с формулой
     и единицами, а не с названием»)

Источник — выгрузка стенда: она уже проверена глазами и принята.

Запуск:
    python3 002_derevo_vyruchka_povtornyh.py ../atlas.db <путь к app/public/data>
    python3 002_derevo_vyruchka_povtornyh.py ../atlas.db <путь> --check   # только проверить

Идемпотентна: повторный запуск ничего не дублирует.
"""
import json, sqlite3, sys, shutil, datetime, pathlib

SLUG = "vyruchka-s-povtornyh"
NAME = "Выручка с повторных клиентов"
SEMYA = "customers"
RAZREZ = "Новый или повторный"
ZNACHENIE = "повторный"


def zagruzit(data_dir):
    a = json.load(open(f"{data_dir}/atlas_full.json", encoding="utf-8"))
    derevo = next((t for t in a["trees"] if t["slug"] == SLUG), None)
    if not derevo:
        sys.exit(f"⛔ дерева «{SLUG}» нет в выгрузке {data_dir}")
    uzly = [n for n in a["nodes"] if n["id"].startswith(SLUG + "/")]
    rebra = [e for e in a["edges"]
             if e["source"].startswith(SLUG + "/") and e["target"].startswith(SLUG + "/")]
    return derevo, uzly, rebra


def primenit(con, derevo, uzly, rebra):
    otchet = []

    # ── 1. артефакт ──────────────────────────────────────────────────────────
    est = con.execute("select id from artifact where slug=?", (SLUG,)).fetchone()
    if est:
        aid = est[0]; otchet.append(f"артефакт уже был, id {aid}")
    else:
        fam = con.execute("select id from family where key=?", (SEMYA,)).fetchone()
        if not fam: sys.exit(f"⛔ семьи «{SEMYA}» нет в family")
        cur = con.execute("""insert into artifact (type,name,slug,access,status,purpose,family_id)
                             values ('tree',?,?,'paid','собрано, не деплоено',?,?)""",
                          (NAME, SLUG, derevo.get("purpose"), fam[0]))
        aid = cur.lastrowid; otchet.append(f"артефакт заведён, id {aid}")

    # ── 2. места ─────────────────────────────────────────────────────────────
    did = con.execute("select id from dimension where name=?", (RAZREZ,)).fetchone()
    if not did: sys.exit(f"⛔ разреза «{RAZREZ}» нет в справочнике")
    varianty = con.execute("select variants from dimension where id=?", (did[0],)).fetchone()[0]
    if ZNACHENIE not in [v.strip() for v in (varianty or "").split(" · ")]:
        sys.exit(f"⛔ значение «{ZNACHENIE}» не из разреза «{RAZREZ}»: {varianty}")

    novyh, bylo = 0, 0
    for n in uzly:
        if con.execute("select 1 from metric_artifact where node_id=?", (n["id"],)).fetchone():
            bylo += 1; continue
        if not con.execute("select 1 from metric where id=?", (n["mid"],)).fetchone():
            sys.exit(f"⛔ метрики mid {n['mid']} нет в базе — сначала завести её")
        srez = n.get("label")
        con.execute("""insert into metric_artifact
                       (metric_id,artifact_id,node_id,y,is_key,role,label_dimension_id,label_value)
                       values (?,?,?,?,?,?,?,?)""",
                    (n["mid"], aid, n["id"], n.get("y"), 1 if n.get("key") else 0, n["role"],
                     did[0] if srez else None, ZNACHENIE if srez else None))
        novyh += 1
    otchet.append(f"мест: заведено {novyh}, уже было {bylo}")

    # ── 3. связи ─────────────────────────────────────────────────────────────
    mesta = {r[0]: r[1] for r in con.execute(
        "select node_id,id from metric_artifact where artifact_id=?", (aid,))}
    svyazey, dubley = 0, 0
    for e in rebra:
        s, t = mesta.get(e["source"]), mesta.get(e["target"])
        if not s or not t: sys.exit(f"⛔ связь ведёт в место, которого нет: {e}")
        if con.execute("select 1 from metric_metric where source_id=? and target_id=?",
                       (s, t)).fetchone():
            dubley += 1; continue
        con.execute("""insert into metric_metric (source_id,target_id,type,sign,style)
                       values (?,?,'influence',?,?)""", (s, t, e.get("sign"), e.get("style")))
        svyazey += 1
    otchet.append(f"связей: заведено {svyazey}, уже было {dubley}")

    # ── 4. переименование 159 / 697 ──────────────────────────────────────────
    novoe = "Средняя цена за единицу товара"
    pereim = 0
    for mid in (159, 697):
        r = con.execute("select name from metric where id=?", (mid,)).fetchone()
        if r and r[0] != novoe:
            con.execute("update metric set name=? where id=?", (novoe, mid)); pereim += 1
    otchet.append(f"переименовано метрик: {pereim}")
    return otchet


def posle_011(con):
    """Миграция 011 (27.09) привела чек к канону: 159 ушла, встали 928 и 929 со срезом.
    Мест 15 → 16, связей 14 → 15, срезов 10 → 11."""
    put = pathlib.Path(__file__).with_name("011_chek_povtornyh_po_kanonu.py")
    if not put.exists():
        return False
    import importlib.util
    spec = importlib.util.spec_from_file_location("m011", put)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.primenena(con)


def posle_014(con):
    """Миграция 014 (29.09) перестроила ветки 1 и 2 по редакции 5.2: ушли 333, 317, 81, 323,
    встали 11 мест, у 413 и 251 срез снят. Мест 16 → 23, связей 15 → 22, срезов 11 → 9."""
    put = pathlib.Path(__file__).with_name("014_vetki_povtornyh_v52.py")
    if not put.exists():
        return False
    import importlib.util
    spec = importlib.util.spec_from_file_location("m014", put)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.primenena(con)


def proverit(con):
    pretenzii = []
    aid = con.execute("select id from artifact where slug=?", (SLUG,)).fetchone()
    if not aid: return ["⛔ артефакта дерева нет"]
    aid = aid[0]
    if posle_014(con):
        zhdu_mest, zhdu_svyazey, zhdu_srezov = 23, 22, 9
    else:
        zhdu_mest, zhdu_svyazey, zhdu_srezov = (16, 15, 11) if posle_011(con) else (15, 14, 10)
    mest = con.execute("select count(*) from metric_artifact where artifact_id=?", (aid,)).fetchone()[0]
    if mest != zhdu_mest: pretenzii.append(f"⛔ мест {mest}, ожидалось {zhdu_mest}")
    klyuch = con.execute("select count(*) from metric_artifact where artifact_id=? and is_key=1",
                         (aid,)).fetchone()[0]
    if klyuch != 1: pretenzii.append(f"⛔ ключевых метрик {klyuch}, ожидалась 1")
    svyaz = con.execute("""select count(*) from metric_metric mm
                           join metric_artifact ms on ms.id=mm.source_id
                           where ms.artifact_id=?""", (aid,)).fetchone()[0]
    if svyaz != zhdu_svyazey: pretenzii.append(f"⛔ связей {svyaz}, ожидалось {zhdu_svyazey}")
    srezov = con.execute("""select count(*) from metric_artifact
                            where artifact_id=? and label_dimension_id is not null""",
                         (aid,)).fetchone()[0]
    if srezov != zhdu_srezov: pretenzii.append(f"⛔ срезов {srezov}, ожидалось {zhdu_srezov}")
    polov = con.execute("""select count(*) from metric_artifact
                           where (label_dimension_id is null) != (label_value is null)""").fetchone()[0]
    if polov: pretenzii.append(f"⛔ мест с половиной label: {polov}")
    for mid in (159, 697):
        imya = con.execute("select name from metric where id=?", (mid,)).fetchone()[0]
        # миграция 015 (30.09) развела их по каналу: 697 — «…офлайн»
        if imya not in ("Средняя цена за единицу товара", "Средняя цена за единицу товара офлайн"):
            pretenzii.append(f"⛔ mid {mid} называется «{imya}»")
    return pretenzii


def main():
    if len(sys.argv) < 3: sys.exit(__doc__)
    db, data_dir = sys.argv[1], sys.argv[2]
    tolko_proverka = "--check" in sys.argv
    derevo, uzly, rebra = zagruzit(data_dir)
    print(f"в выгрузке: узлов {len(uzly)}, связей {len(rebra)}, срезов "
          f"{sum(1 for n in uzly if n.get('label'))}")

    con = sqlite3.connect(db)
    con.execute("pragma foreign_keys=on")
    if not tolko_proverka:
        kopiya = f"{db.rsplit('.db',1)[0]}.before_002_{datetime.datetime.now():%Y%m%d_%H%M%S}.db"
        shutil.copy(db, kopiya)
        print(f"бэкап: {pathlib.Path(kopiya).name}")
        for s in primenit(con, derevo, uzly, rebra): print("  " + s)
        con.commit()
    for p in proverit(con): print(p)
    print("проверка: чисто" if not proverit(con) else "проверка: есть претензии")


if __name__ == "__main__":
    main()
