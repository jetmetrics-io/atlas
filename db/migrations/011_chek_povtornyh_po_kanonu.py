#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Миграция 011 — чек в дереве «Выручка с повторных клиентов» по канону свода.

    python3 011_chek_povtornyh_po_kanonu.py <путь к atlas.db> [--check]

Зачем. Набор «Среднего чека» один во всех деревьях (свод `methodology/TREE.md`, T-5, T-26;
решение Дмитрия 25.09.2026): товаров в заказе × единиц в строке заказа × цена за единицу
до скидок × (1 − средняя фактическая скидка). У цены до скидок и у скидки разные рычаги
и владельцы: ассортимент и ап-селл двигают первую, промокоды, акции и баллы — вторую.
В дереве LTV так с 26.09. В «Выручке с повторных» под «Средним чеком повторных клиентов»
стояла 159 «Средняя цена за единицу товара» — цена уже после скидок, одним множителем.
T-5 записывает это расхождение с 25.09: «приводится миграцией».

Что меняет в дереве:
  - место 159 уходит вместе со связью к чеку. Карточка 159 остаётся на карте «Ассортимент»;
  - встают 928 «Средняя цена за единицу до скидок» (+) и 929 «Средняя фактическая скидка» (−),
    обе со срезом «По повторным клиентам», как соседи 161 и 927 (T-3: множители чека-среза
    считаются по тому же срезу). Пары «метрика × Новый или повторный» у 928 и 929 уже есть
    в metric_dimension, с заметками;
  - порядок по y: 928 на месте 159, 929 последней. Приложение и так ставит минус ниже плюсов (T-71).

Мест было 15, станет 16; связей 14 → 15; срезов 10 → 11. Проверка миграции 002 знает об этом.

Проверки (они же валидатор, `--check`):
  - места 159 в дереве нет, места 928 и 929 есть, у обеих срез «повторный» и подпись;
  - у чека ровно четыре входящие связи: 161 (+), 927 (+), 928 (+), 929 (−);
  - у 928 и 929 есть пара с разрезом «Новый или повторный» в metric_dimension.

Идемпотентна: повторный запуск ничего не дублирует и не портит.
"""
import sys, sqlite3, shutil, pathlib, datetime

SLUG = "vyruchka-s-povtornyh"
CHEK = 136
UHODIT = 159
RAZREZ_ID = 8                      # «Новый или повторный», dimension.id
ZNACHENIE = "повторный"            # из dimension.variants дословно (правило миграции 001)
PODPIS = "По повторным клиентам"   # как у соседей по дереву (миграция 003)

# mid → (y, знак связи к чеку). y у 159 было 1500.
NOVYE = {
    928: (1500.0, "+"),
    929: (1600.0, "-"),
}
ZNAKI_CHEKA = {161: "+", 927: "+", 928: "+", 929: "-"}


def derevo(con):
    r = con.execute("select id from artifact where slug=? and type='tree'", (SLUG,)).fetchone()
    if not r:
        sys.exit(f"✖ дерева «{SLUG}» нет в базе — сначала миграция 002")
    return r[0]


def mesto(con, aid, mid):
    return con.execute("select id from metric_artifact where artifact_id=? and metric_id=?",
                       (aid, mid)).fetchone()


def primenit(con):
    aid = derevo(con)
    chek = mesto(con, aid, CHEK)
    if not chek:
        sys.exit(f"✖ в дереве нет места чека {CHEK}")
    chek = chek[0]
    otchet = []

    staroe = mesto(con, aid, UHODIT)
    if staroe:
        n = con.execute("delete from metric_metric where source_id=? or target_id=?",
                        (staroe[0], staroe[0])).rowcount
        con.execute("delete from metric_artifact where id=?", (staroe[0],))
        otchet.append(f"место {UHODIT} снято, связей снято: {n}")
    else:
        otchet.append(f"места {UHODIT} уже нет")

    for mid, (y, znak) in NOVYE.items():
        est = mesto(con, aid, mid)
        if est:
            pid = est[0]
            otchet.append(f"место {mid} уже было")
        else:
            slug = con.execute("select slug from metric where id=?", (mid,)).fetchone()
            if not slug:
                sys.exit(f"✖ метрики {mid} нет в базе — сначала миграция 005")
            pid = con.execute(
                """insert into metric_artifact (metric_id, artifact_id, node_id, y, is_key, role,
                                                label_dimension_id, label_value, label_text)
                   values (?, ?, ?, ?, 0, 'driver', ?, ?, ?)""",
                (mid, aid, f"{SLUG}/{slug[0]}", y, RAZREZ_ID, ZNACHENIE, PODPIS)).lastrowid
            otchet.append(f"место {mid} поставлено")
        svyaz = con.execute("select id from metric_metric where source_id=? and target_id=?",
                            (pid, chek)).fetchone()
        if not svyaz:
            con.execute("""insert into metric_metric (source_id, target_id, type, sign, style)
                           values (?, ?, 'influence', ?, 'solid')""", (pid, chek, znak))
            otchet.append(f"  связь {mid} → чек ({znak}) поставлена")
    return otchet


def proverit(con):
    """Список претензий. Пустой список — всё чисто."""
    aid = derevo(con)
    pretenzii = []
    if mesto(con, aid, UHODIT):
        pretenzii.append(f"⛔ место {UHODIT} всё ещё в дереве")
    for mid in NOVYE:
        r = con.execute("""select label_dimension_id, label_value, label_text from metric_artifact
                           where artifact_id=? and metric_id=?""", (aid, mid)).fetchone()
        if not r:
            pretenzii.append(f"⛔ места {mid} в дереве нет")
        elif r != (RAZREZ_ID, ZNACHENIE, PODPIS):
            pretenzii.append(f"⛔ у места {mid} срез {r}, ожидался {(RAZREZ_ID, ZNACHENIE, PODPIS)}")
        para = con.execute("select 1 from metric_dimension where metric_id=? and dimension_id=?",
                           (mid, RAZREZ_ID)).fetchone()
        if not para:
            pretenzii.append(f"⛔ у метрики {mid} нет пары с разрезом «Новый или повторный»")
    chek = mesto(con, aid, CHEK)
    if chek:
        vhod = dict(con.execute("""select s.metric_id, e.sign from metric_metric e
                                   join metric_artifact s on s.id = e.source_id
                                   where e.target_id = ?""", (chek[0],)).fetchall())
        if vhod != ZNAKI_CHEKA:
            pretenzii.append(f"⛔ у чека входящие {vhod}, ожидались {ZNAKI_CHEKA}")
    return pretenzii


def primenena(con):
    """Для валидаторов прежних миграций: стоит ли уже чек по канону."""
    r = con.execute("select id from artifact where slug=? and type='tree'", (SLUG,)).fetchone()
    return bool(r) and mesto(con, r[0], 929) is not None and mesto(con, r[0], UHODIT) is None


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    put = pathlib.Path(sys.argv[1]).resolve()
    tolko_proverka = "--check" in sys.argv
    if not put.exists():
        sys.exit(f"✖ базы нет: {put}")
    con = sqlite3.connect(put)
    con.execute("pragma foreign_keys=on")

    if not tolko_proverka:
        metka = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        kopiya = put.with_name(f"{put.stem}.before_011_{metka}{put.suffix}")
        shutil.copy2(put, kopiya)
        print(f"бэкап: {kopiya.name}")
        for s in primenit(con):
            print("  " + s)
        con.commit()

    aid = derevo(con)
    mest = con.execute("select count(*) from metric_artifact where artifact_id=?", (aid,)).fetchone()[0]
    print(f"мест в дереве «{SLUG}»: {mest}")
    pretenzii = proverit(con)
    if pretenzii:
        print(f"\nпретензий: {len(pretenzii)}")
        for p in pretenzii:
            print(" ", p)
        sys.exit(1)
    print("проверка: чисто")


if __name__ == "__main__":
    main()
