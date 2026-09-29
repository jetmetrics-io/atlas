#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Миграция 012 — вопросы дерева «Выручка с повторных клиентов».

    python3 012_voprosy_povtornyh.py <путь к atlas.db> [--check]

Зачем. По канону у каждой метрики дерева есть вопрос, на который отвечает её значение
(свод `methodology/TREE.md`, T-2). Панель «Вопросы дерева» показывает их справа от холста
у любого дерева, где вопросы заполнены (миграция 008, первым было дерево LTV). Здесь
вопросы получает второе дерево. Код приложения не меняется.

Тексты приняты Дмитрием 27.09.2026 все 16. Слово — «покупатель», как в разовых покупках
LTV. Пять вопросов чека и доставки взяты из дерева LTV дословно: метрика та же.
Вопрос про пуши построен по образцу вопроса 951 про рассылку в LTV.

⚠️ Проверку 3 из T-2 («ответы детей вместе отвечают на вопрос родителя») ветки
«Повторные клиенты» и «Заказов на клиента» не проходят: стоят на одних причинах, кусков
нет. Записано в свод (TREE 0.44, T-2); Дмитрий 27.09: вопросы ставятся сейчас, ветки
чинятся отдельной задачей. Их вопросы при починке остаются.

Идёт после 011: вопрос есть у 928 и 929, а у 159 его нет — её в дереве уже нет.

Проверки (`--check`): у каждого места дерева вопрос из списка ниже, и проверка 008
по всем деревьям с вопросами чиста — вопрос кончается «?», не повторяет имя метрики,
у соседей разный, без разметки, у мест карт вопросов нет.

Идемпотентна: повторный запуск ничего не дублирует и не портит.
"""
import sys, sqlite3, shutil, pathlib, datetime, importlib.util

SLUG = "vyruchka-s-povtornyh"

# mid → вопрос, в порядке экрана. ♻️ — дословно из дерева LTV (миграция 008).
VOPROSY = {
    134: "Сколько денег приносят покупатели, которые к нам вернулись?",
    126: "Сколько покупателей вернулись к нам за новой покупкой?",
    413: "Приходят ли заказы вовремя?",                                          # ♻️
    251: "Решает ли поддержка проблемы покупателей?",
    186: "Сколько времени товары есть в наличии?",
    333: "Какую часть купленного покупатели возвращают?",
    121: "Сколько заказов делает вернувшийся покупатель?",
    317: "Пользуются ли участники программой лояльности?",
    81:  "До скольких пользователей приложения мы можем дотянуться пушами?",     # по образцу 951
    323: "Как часто покупатели платят бонусами?",
    405: "Как быстро мы довозим заказ?",
    136: "Сколько вернувшийся покупатель тратит за один заказ?",
    161: "Сколько разных товаров покупатель кладёт в один заказ?",               # ♻️
    927: "Сколько штук каждого товара он берёт?",                                # ♻️
    928: "Сколько в среднем стоит одна купленная штука без скидок?",             # ♻️
    929: "Сколько мы уступаем от цены промокодами, акциями и баллами?",          # ♻️
}


def m008():
    put = pathlib.Path(__file__).with_name("008_vopros_na_meste.py")
    spec = importlib.util.spec_from_file_location("m008", put)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def derevo(con):
    r = con.execute("select id from artifact where slug=? and type='tree'", (SLUG,)).fetchone()
    if not r:
        sys.exit(f"✖ дерева «{SLUG}» нет в базе — сначала миграция 002")
    return r[0]


def primenit(con):
    if "question" not in m008().stolbcy(con, "metric_artifact"):
        sys.exit("✖ колонки question нет — сначала миграция 008")
    aid = derevo(con)
    postavleno = stoyalo = 0
    for mid, tekst in VOPROSY.items():
        r = con.execute("select id, question from metric_artifact where artifact_id=? and metric_id=?",
                        (aid, mid)).fetchone()
        if not r:
            sys.exit(f"✖ в дереве «{SLUG}» нет места метрики {mid} — сначала миграция 011")
        if r[1] == tekst:
            stoyalo += 1
            continue
        con.execute("update metric_artifact set question=? where id=?", (tekst, r[0]))
        postavleno += 1
    return postavleno, stoyalo


def posle_014(con):
    """Миграция 014 (29.09) перестроила ветки по редакции 5.2: четыре места ушли вместе
    с вопросами, у 11 новых свои. Список ниже тогда не полный — вопросы сверяет 014."""
    put = pathlib.Path(__file__).with_name("014_vetki_povtornyh_v52.py")
    if not put.exists():
        return False
    spec = importlib.util.spec_from_file_location("m014", put)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.primenena(con)


def proverit(con):
    aid = derevo(con)
    pretenzii = []
    if posle_014(con):
        return m008().proverit(con)
    mesta = dict(con.execute("select metric_id, question from metric_artifact where artifact_id=?",
                             (aid,)).fetchall())
    if set(mesta) != set(VOPROSY):
        pretenzii.append(f"⛔ места дерева {sorted(mesta)} не совпадают со списком {sorted(VOPROSY)}")
    for mid, tekst in VOPROSY.items():
        if mid in mesta and mesta[mid] != tekst:
            pretenzii.append(f"⛔ у {mid} вопрос {mesta[mid]!r}, ожидался {tekst!r}")
    return pretenzii + m008().proverit(con)


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    put = pathlib.Path(sys.argv[1]).resolve()
    tolko_proverka = "--check" in sys.argv
    if not put.exists():
        sys.exit(f"✖ базы нет: {put}")
    con = sqlite3.connect(put)

    if not tolko_proverka:
        metka = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        kopiya = put.with_name(f"{put.stem}.before_012_{metka}{put.suffix}")
        shutil.copy2(put, kopiya)
        print(f"бэкап: {kopiya.name}")
        postavleno, stoyalo = primenit(con)
        con.commit()
        print(f"  вопросов дерева «{SLUG}»: поставлено {postavleno}, уже стояло {stoyalo}")

    print(m008().svodka(con))
    pretenzii = proverit(con)
    if pretenzii:
        print(f"\nпретензий: {len(pretenzii)}")
        for p in pretenzii:
            print(" ", p)
        sys.exit(1)
    print("проверка: чисто")


if __name__ == "__main__":
    main()
