#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Миграция 017 — «Конверсия в покупку»: магазины можно сравнивать внутри формата.

    python3 017_konversiya_sravnenie_magazinov.py <путь к atlas.db> [--check]

Зачем. В нюансах «Конверсии в покупку» стояло: «сравнивать её можно только с собственной
историей». Из-за семейного трафика конверсия магазина ниже, чем кажется, но это не делает
сравнение магазинов бессмысленным: внутри одного формата оно честное, и именно так ищут
магазины, которым нужна помощь. Запрет спорил с вопросами к метрике, которые готовились
01.10.2026, и с обычной практикой разбора сети. Решение — Мария, 01.10.2026: нюанс смягчить,
сравнение внутри формата разрешить, поправку на семейный трафик оставить.

Что делает: в `metric.nuances` у «Конверсии в покупку» заменяет конец первого нюанса.
Остальные нюансы не трогает.

Проверки (`--check`): новая фраза стоит, старой нет.

Идемпотентна: повторный запуск ничего не меняет.
"""
import sys, sqlite3, shutil, pathlib, datetime

METRIKA = "Конверсия в покупку"
BYLO = ("**всегда ниже, чем кажется**, и сравнивать её можно только с собственной историей.")
STALO = ("**всегда ниже, чем кажется**. Магазины сравнивают между собой **внутри одного формата** "
         "и помнят, что при семейном трафике конверсия ниже при той же работе зала.")


def primenit(con):
    otchet = []
    row = con.execute("select id, nuances from metric where name=?", (METRIKA,)).fetchone()
    if not row:
        return [f"⛔ нет метрики «{METRIKA}»"]
    mid, t = row
    if STALO in (t or ""):
        otchet.append("нюанс уже поправлен")
    elif BYLO in (t or ""):
        con.execute("update metric set nuances=? where id=?", (t.replace(BYLO, STALO, 1), mid))
        otchet.append(f"{mid}.nuances: сравнение магазинов внутри формата")
    else:
        otchet.append("⛔ исходная фраза не найдена, ничего не менял")
    return otchet


def proverit(con):
    pretenzii = []
    row = con.execute("select nuances from metric where name=?", (METRIKA,)).fetchone()
    if not row:
        return [f"⛔ нет метрики «{METRIKA}»"]
    t = row[0] or ""
    if STALO not in t:
        pretenzii.append("⛔ новой фразы нет")
    if "сравнивать её можно только с собственной историей" in t:
        pretenzii.append("⛔ старая фраза осталась")
    return pretenzii


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
        kopiya = put.with_name(f"{put.stem}.before_017_{metka}{put.suffix}")
        shutil.copy2(put, kopiya)
        print(f"бэкап: {kopiya.name}")
        for s in primenit(con):
            print("  " + s)
        con.commit()

    pretenzii = proverit(con)
    if pretenzii:
        print(f"\nпретензий: {len(pretenzii)}")
        for p in pretenzii:
            print(" ", p)
        sys.exit(1)
    print("проверка: чисто")


if __name__ == "__main__":
    main()
