#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Миграция 007 — дерево «Пожизненная ценность клиента (LTV)» в базу.

    python3 007_derevo_ltv.py <путь к atlas.db> [--check]

Дмитрий посмотрел дерево в приложении на локальном стенде и дал «да» на перенос в базу 26.09.2026.
Показ в приложении требует кода оси «Модель оплаты» (`src/tree/tree.ts`, отдельный коммит).

Источник — спеки редакции 14 (`design/trees_ltv/spec/дерево_1.json`, `дерево_3.json`)
с решениями Дмитрия 25.09 (`design/trees_ltv/00_журнал.md`, проход 37):
  - узел Д1 2.1 — 919 по фактической смеси тарифов; узлы Д1 2.3–2.5 (выбор самого
    дорогого тарифа, апгрейды, даунгрейды) из дерева уходят под 919 действиями (T-15, T-35);
  - комиссия за приём платежей — одна карточка 944 на обе модели;
  - срок жизни — одна карточка 625 на обе модели (C-11);
  - удовлетворённость в подписке — CSAT по продукту, 938.
mid — настоящие: 28 новых карточек заведены миграцией 005 (928–955), остальные — из Атласа.

Одно дерево, две модели (C-11): модель делит разбор, а не метрику. Метрики модели
размечены группой, общие — «ОБЩЕЕ ДЛЯ ВСЕХ». «Средняя фактическая скидка» (929) стоит
в дереве одним местом, но двумя связями: под доходом на аккаунт в подписке и под средним
чеком в разовых покупках. На экране видна одна модель, поэтому и скидка видна один раз.

Группы моделей — «ЕСЛИ ПРОДАЁТЕ ПО ПОДПИСКЕ» и «ЕСЛИ ПРОДАЁТЕ БЕЗ ПОДПИСКИ», своя ось
«Модель оплаты» в приложении. Не «ЕСЛИ РАБОТАЕТЕ ПО ПОДПИСКЕ»: эта строка уже стоит в оси
«Канал продаж» дерева «Выручка», профиль у деревьев общий, и выбор модели в LTV
прятал бы ветки «Выручки».

Идемпотентна: повторный запуск ничего не дублирует.
"""
import sys, sqlite3, shutil, pathlib, datetime

SLUG = "ltv"
NAME = "Пожизненная ценность клиента (LTV)"
PURPOSE = "Чем двигать пожизненную ценность клиента"
SEMYA = "customers"
DOSTUP = "paid"

OBSHEE = "ОБЩЕЕ ДЛЯ ВСЕХ"
PODP = "ЕСЛИ ПРОДАЁТЕ ПО ПОДПИСКЕ"
RAZ = "ЕСЛИ ПРОДАЁТЕ БЕЗ ПОДПИСКИ"

# (mid, роль, группа, y, [(родитель mid, знак), ...], откуда в спеке)
# y держит порядок внутри родителя: на экране видна одна модель, и порядок в каждой
# совпадает со спекой. Знак «−» приложение всё равно ставит ниже «+».
UZLY = [
    (518, "key",       None,   0,   [],                    "корень"),
    # ── компоненты ───────────────────────────────────────────────────────────
    (930, "component", OBSHEE, 100, [(518, "+")],          "Д1 1 = Д3 1"),
    (934, "component", PODP,   200, [(518, "+")],          "Д1 2"),
    (198, "component", RAZ,    210, [(518, "+")],          "Д3 2"),
    (947, "component", RAZ,    300, [(518, "+")],          "Д3 3"),
    (625, "component", OBSHEE, 400, [(518, "+")],          "Д1 3 = Д3 4"),
    # ── статьи маржинальной рентабельности ──────────────────────────────────
    (942, "driver",    RAZ,    1010, [(930, "-")],         "Д3 1.1"),
    (931, "driver",    PODP,   1011, [(930, "-")],         "Д1 1.1"),
    (294, "driver",    RAZ,    1020, [(930, "-")],         "Д3 1.2"),
    (932, "driver",    PODP,   1021, [(930, "-")],         "Д1 1.2"),
    (943, "driver",    RAZ,    1030, [(930, "-")],         "Д3 1.3"),
    (944, "driver",    OBSHEE, 1040, [(930, "-")],         "Д1 1.3 = Д3 1.4"),
    (933, "driver",    PODP,   1041, [(930, "-")],         "Д1 1.4"),
    (945, "driver",    RAZ,    1050, [(930, "-")],         "Д3 1.5"),
    (946, "driver",    RAZ,    1060, [(930, "-")],         "Д3 1.6"),
    # ── доход на аккаунт и средний чек ──────────────────────────────────────
    (919, "driver",    PODP,   2010, [(934, "+")],         "Д1 2.1"),
    (161, "driver",    RAZ,    2020, [(198, "+")],         "Д3 2.1"),
    (927, "driver",    RAZ,    2030, [(198, "+")],         "Д3 2.2"),
    (928, "driver",    RAZ,    2040, [(198, "+")],         "Д3 2.3"),
    (929, "driver",    OBSHEE, 2050, [(934, "-"), (198, "-")], "Д1 2.2 = Д3 2.4"),
    # ── частота покупок ─────────────────────────────────────────────────────
    (948, "driver",    RAZ,    3010, [(947, "+")],         "Д3 3.1"),
    (949, "driver",    RAZ,    3020, [(947, "+")],         "Д3 3.2"),
    (950, "driver",    RAZ,    3030, [(947, "+")],         "Д3 3.3"),
    (951, "driver",    RAZ,    3040, [(947, "+")],         "Д3 3.4"),
    # ── срок жизни ──────────────────────────────────────────────────────────
    (935, "driver",    PODP,   4010, [(625, "+")],         "Д1 3.1"),
    (952, "driver",    RAZ,    4011, [(625, "+")],         "Д3 4.1"),
    (936, "driver",    PODP,   4020, [(625, "+")],         "Д1 3.2"),
    (953, "driver",    RAZ,    4021, [(625, "-")],         "Д3 4.2"),
    (937, "driver",    PODP,   4030, [(625, "+")],         "Д1 3.3"),
    (413, "driver",    RAZ,    4031, [(625, "+")],         "Д3 4.3"),
    (938, "driver",    PODP,   4040, [(625, "+")],         "Д1 3.4"),
    (954, "driver",    RAZ,    4041, [(625, "+")],         "Д3 4.4"),
    (939, "driver",    PODP,   4050, [(625, "+")],         "Д1 3.5"),
    (955, "driver",    RAZ,    4051, [(625, "+")],         "Д3 4.5"),
    (940, "driver",    PODP,   4060, [(625, "+")],         "Д1 3.6"),
    (941, "driver",    PODP,   4070, [(625, "-")],         "Д1 3.7"),
]
MEST = len(UZLY)
SVYAZEY = sum(len(u[4]) for u in UZLY)


def node_id(con, mid):
    slug = con.execute("select slug from metric where id=?", (mid,)).fetchone()
    if not slug:
        sys.exit(f"⛔ метрики mid {mid} нет в базе — сначала миграция 005")
    return f"{SLUG}/{slug[0]}"


def primenit(con):
    otchet = []
    est = con.execute("select id from artifact where slug=?", (SLUG,)).fetchone()
    if est:
        aid = est[0]; otchet.append(f"артефакт уже был, id {aid}")
    else:
        fam = con.execute("select id from family where key=?", (SEMYA,)).fetchone()
        if not fam: sys.exit(f"⛔ семьи «{SEMYA}» нет в family")
        cur = con.execute("""insert into artifact (type,name,slug,access,status,purpose,family_id)
                             values ('tree',?,?,?,'собрано, не деплоено',?,?)""",
                          (NAME, SLUG, DOSTUP, PURPOSE, fam[0]))
        aid = cur.lastrowid; otchet.append(f"артефакт заведён, id {aid}")

    novyh = bylo = 0
    for mid, rol, gr, y, _, _ in UZLY:
        nid = node_id(con, mid)
        if con.execute("select 1 from metric_artifact where node_id=?", (nid,)).fetchone():
            bylo += 1; continue
        con.execute("""insert into metric_artifact (metric_id,artifact_id,node_id,y,is_key,role,"group")
                       values (?,?,?,?,?,?,?)""",
                    (mid, aid, nid, float(y), 1 if rol == "key" else 0, rol, gr))
        novyh += 1
    otchet.append(f"мест: заведено {novyh}, уже было {bylo}")

    mesta = {r[0]: r[1] for r in con.execute(
        "select metric_id, id from metric_artifact where artifact_id=?", (aid,))}
    svyazey = dubley = 0
    for mid, _, _, _, roditeli, _ in UZLY:
        for rod, znak in roditeli:
            s, t = mesta[mid], mesta[rod]
            if con.execute("select 1 from metric_metric where source_id=? and target_id=?",
                           (s, t)).fetchone():
                dubley += 1; continue
            con.execute("""insert into metric_metric (source_id,target_id,type,sign,style)
                           values (?,?,'influence',?,'solid')""", (s, t, znak))
            svyazey += 1
    otchet.append(f"связей: заведено {svyazey}, уже было {dubley}")
    return otchet


def proverit(con):
    pretenzii = []
    aid = con.execute("select id from artifact where slug=?", (SLUG,)).fetchone()
    if not aid: return ["⛔ артефакта дерева нет"]
    aid = aid[0]
    mest = con.execute("select count(*) from metric_artifact where artifact_id=?", (aid,)).fetchone()[0]
    if mest != MEST: pretenzii.append(f"⛔ мест {mest}, ожидалось {MEST}")
    klyuch = con.execute("select metric_id from metric_artifact where artifact_id=? and is_key=1",
                         (aid,)).fetchall()
    if klyuch != [(518,)]: pretenzii.append(f"⛔ ключевая {klyuch}, ожидалась 518")
    svyaz = con.execute("""select count(*) from metric_metric mm
                           join metric_artifact ms on ms.id=mm.source_id
                           join metric_artifact mt on mt.id=mm.target_id
                           where ms.artifact_id=? and mt.artifact_id=?""", (aid, aid)).fetchone()[0]
    if svyaz != SVYAZEY: pretenzii.append(f"⛔ связей {svyaz}, ожидалось {SVYAZEY}")
    # у каждого узла, кроме корня, есть родитель; корень ни в кого не входит
    sirot = con.execute("""select m.name from metric_artifact ma join metric m on m.id=ma.metric_id
                           where ma.artifact_id=? and ma.is_key=0 and not exists (
                             select 1 from metric_metric mm where mm.source_id=ma.id)""", (aid,)).fetchall()
    if sirot: pretenzii.append(f"⛔ узлы без родителя: {[s[0] for s in sirot]}")
    # Знак связи не спорит с «Сутью»: под родителем «больше-лучше» плюс стоит у метрик
    # «больше-лучше», минус — у «меньше-лучше». «Баланс» не проверяется.
    for mid, _, _, _, roditeli, _ in UZLY:
        sut = con.execute("select essence from metric where id=?", (mid,)).fetchone()[0]
        for rod, znak in roditeli:
            sut_rod = con.execute("select essence from metric where id=?", (rod,)).fetchone()[0]
            if sut_rod != "больше-лучше" or sut not in ("больше-лучше", "меньше-лучше"):
                continue
            if (znak == "+") != (sut == "больше-лучше"):
                pretenzii.append(f"⛔ mid {mid} → {rod}: знак {znak}, а суть «{sut}»")
    return pretenzii


def main():
    if len(sys.argv) < 2: sys.exit(__doc__)
    db = sys.argv[1]
    con = sqlite3.connect(db)
    con.execute("pragma foreign_keys=on")
    if "--check" not in sys.argv:
        kopiya = f"{db.rsplit('.db',1)[0]}.before_007_{datetime.datetime.now():%Y%m%d_%H%M%S}.db"
        shutil.copy(db, kopiya)
        print(f"бэкап: {pathlib.Path(kopiya).name}")
        for s in primenit(con): print("  " + s)
        con.commit()
    pret = proverit(con)
    for p in pret: print(p)
    print("проверка: чисто" if not pret else "проверка: есть претензии")


if __name__ == "__main__":
    main()
