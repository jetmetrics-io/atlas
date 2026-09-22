#!/usr/bin/env python3
"""Донести переименование «Средняя цена товара» до текстов карточек.

    python3 004_imya_ceny_v_tekstah.py <путь к atlas.db> [--check]

Миграция 002 переименовала сами метрики mid 159 и 697, но старое имя осталось
внутри текстов соседних карточек — в «Нюансах», «Примере расчёта» и в ручных
ссылках [[имя→адрес]]. В выгрузку эти шесть правок уехали через
`data/_pending/fixes_atlas.json` и в бою стоят с 22.09.2026, а до базы не дошли:
правка пошла в выгрузку, минуя базу. Так база и бой разошлись за один день.

Правила замены — дословно из `fixes_atlas.json`, раздел "text". После этой
миграции файл правок больше не нужен: база и выгрузка говорят одно и то же.

Правка идёт по ВСЕМ текстовым полям метрики: карточка одна на все её места
(RULES.md § «Метрика сквозная»), значит и текст один.
"""
import sys, sqlite3, shutil, pathlib, datetime

# Дословно из data/_pending/fixes_atlas.json, раздел "text".
# Порядок важен: длинные образцы идут раньше, иначе короткий съест часть длинного.
ZAMENY = [
    ("«Среднюю цену товара»",            "«Среднюю цену за единицу товара»"),
    ("«Средней цене товара»",            "«Средней цене за единицу товара»"),
    ("[[Средняя цена товара→",           "[[Средняя цена за единицу товара→"),
    ("средняя цена товара 600 ₽",        "средняя цена за единицу товара 600 ₽"),
    ("Средняя цена товара = 12 000 000", "Средняя цена за единицу товара = 12 000 000"),
]

# Все текстовые поля карточки. Имя метрики здесь НЕ трогаем: его переименовала 002.
POLYA = ["formula", "alt_formula", "description", "nuances", "example",
         "importance", "not_needed", "essence", "essence_note", "synonyms"]


def pochinit(tekst):
    """Вернуть исправленный текст или None, если менять нечего."""
    if not tekst:
        return None
    novyy = tekst
    for bylo, stalo in ZAMENY:
        novyy = novyy.replace(bylo, stalo)
    return novyy if novyy != tekst else None


def primenit(con):
    otchet, pravok, metrik = [], 0, set()
    for pole in POLYA:
        for mid, tekst in con.execute(f"select id, {pole} from metric where {pole} is not null"):
            novyy = pochinit(tekst)
            if novyy is None:
                continue
            con.execute(f"update metric set {pole}=? where id=?", (novyy, mid))
            pravok += 1
            metrik.add(mid)
    otchet.append(f"правок в текстах: {pravok} (метрик затронуто: {len(metrik)})")
    if metrik:
        for mid in sorted(metrik):
            imya = con.execute("select name from metric where id=?", (mid,)).fetchone()[0]
            otchet.append(f"  mid {mid}  «{imya}»")
    return otchet


def proverit(con):
    """Старого имени не должно остаться ни в одном текстовом поле.

    Ищем ровно те образцы, что перечислены в ZAMENY, а не подстроку «цена товара»
    вообще: в Атласе есть законные тексты про цену товара, не относящиеся к метрике.
    """
    pretenzii = []
    for pole in POLYA:
        for mid, tekst in con.execute(f"select id, {pole} from metric where {pole} is not null"):
            for bylo, _ in ZAMENY:
                if bylo in tekst:
                    pretenzii.append(f"⛔ mid {mid}, поле {pole}: осталось {bylo!r}")
    # имена самих метрик должны быть уже переименованы миграцией 002
    for mid in (159, 697):
        r = con.execute("select name from metric where id=?", (mid,)).fetchone()
        if r and r[0] != "Средняя цена за единицу товара":
            pretenzii.append(f"⛔ mid {mid} называется «{r[0]}» — сперва прогнать 002")
    return pretenzii


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    db = sys.argv[1]
    con = sqlite3.connect(db)
    con.execute("pragma foreign_keys=on")
    if "--check" not in sys.argv:
        kopiya = f"{db.rsplit('.db', 1)[0]}.before_004_{datetime.datetime.now():%Y%m%d_%H%M%S}.db"
        shutil.copy(db, kopiya)
        print(f"бэкап: {pathlib.Path(kopiya).name}")
        for s in primenit(con):
            print("  " + s)
        con.commit()
    pret = proverit(con)
    for p in pret:
        print(p)
    print("проверка: чисто" if not pret else "проверка: есть претензии")


if __name__ == "__main__":
    main()
