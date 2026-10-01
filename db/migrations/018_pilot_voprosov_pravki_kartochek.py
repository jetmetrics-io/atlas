#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Миграция 018 — противоречия в карточках, найденные пилотом вопросов к метрикам.

    python3 018_pilot_voprosov_pravki_kartochek.py <путь к atlas.db> [--check]

Зачем. 01.10.2026 вопросы к метрикам карт «Заказы» и «SaaS продукты» проверяли агенты,
и по дороге всплыли карточки, которые спорят сами с собой или с соседями. Решения — Мария,
01.10.2026.

Что делает:

  1. «Неоплаченные заказы»: нюанс говорил, что отменённые до оплаты входят сюда, а пример
     этой же карточки и карточка «Отмененные заказы» их вычитают. Нюанс приведён к примеру:
     отменённые клиентом или компанией — в «Отмененных заказах», закрытые по неоплате — здесь.
     Размещённые раскладываются без остатка: оплаченные + отменённые + неоплаченные + ждущие.

  2. «Средний чек заказов с промокодом (AOV)»: стояло «по тем же правилам, что и средний чек:
     без стоимости доставки», а в «Среднем чеке (AOV)» вопрос о доставке открыт и по формуле
     она входит. Теперь — как решено для «Среднего чека (AOV)».

  3. «Средний срок жизни промокода»: разрез «Тип промокода» (общие и персональные) спорил
     с нюансом «персональные в расчёт не идут». Решение Марии — персональные считаются: нюанс
     снят, строка о пачке персональных убрана из примера. Разрез остаётся.
     У «Количества активных промокодов» правило «только публичные» своё, его не трогали.

  4. «Рост выручки от апселов» → «Рост выручки от апселлов»: в карточках и синонимах пишут
     «апселлы». Адрес (slug) не меняется, ссылки не ломаются; поправлены пример карточки
     и текст ссылки в «% апгрейдов».

Проверки (`--check`): новые тексты стоят, старых нет.

Идемпотентна: повторный запуск ничего не меняет.
"""
import sys, sqlite3, shutil, pathlib, datetime, re

NEOPL_BYLO = "Отменённые заказы **входят сюда**, если оплата по ним не проходила."
NEOPL_STALO = ("Заказы, отменённые клиентом или компанией до оплаты, сюда **не входят**: они в "
               "[[«Отмененных заказах»→zakazy/otmenennye_zakazy]]. Сюда идут заказы, брошенные без оплаты "
               "и закрытые по истечении срока ожидания.")

PROMO_BYLO = "База **считается по тем** же правилам, что и средний чек: без стоимости доставки, за вычетом возвратов."
PROMO_STALO = ("База **считается по тем** же правилам, что и [[«Средний чек (AOV)»→zakazy/sredniy_chek_aov]]: "
               "за вычетом возвратов, а доставка входит или не входит так же, как решено там.")

SROK_NUANS = re.compile(r"\*\*Считаются публичные коды\*\*.*?(?:<br>|$)", re.S)
SROK_PRIMER = [("Публичных промокодов со сроком за квартал: 40", "Промокодов со сроком за квартал: 40"),
               ("<br>Пачка из 3 200 персональных кодов: не считаем", "")]

APSEL = [  # (id, поле, было, стало)
    (639, "name", "Рост выручки от апселов", "Рост выручки от апселлов"),
    (639, "example", "Рост выручки от апселов =", "Рост выручки от апселлов ="),
    (642, "nuances", "[[«Рост выручки от апселов»→", "[[«Рост выручки от апселлов»→"),
]


def mid(con, name):
    r = con.execute("select id from metric where name=?", (name,)).fetchone()
    return r[0] if r else None


def zamena(con, m, pole, bylo, stalo, otchet, metka):
    t = con.execute(f"select {pole} from metric where id=?", (m,)).fetchone()[0] or ""
    if bylo and bylo in t:
        con.execute(f"update metric set {pole}=? where id=?", (t.replace(bylo, stalo, 1), m))
        otchet.append(f"{m}.{pole}: {metka}")


def primenit(con):
    otchet = []
    zamena(con, mid(con, "Неоплаченные заказы"), "nuances", NEOPL_BYLO, NEOPL_STALO, otchet, "отменённые — в «Отмененных заказах»")
    zamena(con, mid(con, "Средний чек заказов с промокодом (AOV)"), "nuances", PROMO_BYLO, PROMO_STALO, otchet, "доставка — как у «Среднего чека (AOV)»")
    s = mid(con, "Средний срок жизни промокода")
    t = con.execute("select nuances from metric where id=?", (s,)).fetchone()[0] or ""
    t2 = SROK_NUANS.sub("", t)
    if t2 != t:
        con.execute("update metric set nuances=? where id=?", (t2, s))
        otchet.append(f"{s}.nuances: снят нюанс «только публичные коды»")
    for bylo, stalo in SROK_PRIMER:
        zamena(con, s, "example", bylo, stalo, otchet, f"пример: {bylo.strip('<br>')[:30]}…")
    for m, pole, bylo, stalo in APSEL:
        zamena(con, m, pole, bylo, stalo, otchet, "апселлы")
    return otchet or ["всё уже внесено"]


def proverit(con):
    pr = []
    def pole(name, p): return con.execute(f"select {p} from metric where name=?", (name,)).fetchone()
    t = (pole("Неоплаченные заказы", "nuances") or [""])[0]
    if NEOPL_STALO not in t or NEOPL_BYLO in t: pr.append("⛔ «Неоплаченные заказы»: нюанс не поправлен")
    t = (pole("Средний чек заказов с промокодом (AOV)", "nuances") or [""])[0]
    if PROMO_STALO not in t or PROMO_BYLO in t: pr.append("⛔ промокодный чек: нюанс о доставке не поправлен")
    n, e = pole("Средний срок жизни промокода", "nuances, example") or ("", "")
    if "Считаются публичные коды" in n or "персональных кодов: не считаем" in e: pr.append("⛔ срок промокода: нюанс или пример не поправлен")
    if not con.execute("select 1 from metric where id=639 and name='Рост выручки от апселлов'").fetchone(): pr.append("⛔ 639 не переименована")
    for p in ("name", "example", "nuances", "description", "importance"):
        for r in con.execute(f"select id from metric where {p} like '%от апселов%'"):
            pr.append(f"⛔ {r[0]}.{p}: осталось «от апселов»")
    uzly = {r[0] for r in con.execute("select node_id from metric_artifact")}
    for name in ("Неоплаченные заказы", "Средний чек заказов с промокодом (AOV)", "% апгрейдов"):
        for adres in re.findall(r"\[\[[^\]→]+→([^\]]+)\]\]", (pole(name, "nuances") or [""])[0]):
            if adres not in uzly: pr.append(f"⛔ {name}: ссылка в никуда {adres}")
    return pr


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    put = pathlib.Path(sys.argv[1]).resolve()
    if not put.exists():
        sys.exit(f"✖ базы нет: {put}")
    con = sqlite3.connect(put)
    con.execute("pragma foreign_keys=on")
    if "--check" not in sys.argv:
        kopiya = put.with_name(f"{put.stem}.before_018_{datetime.datetime.now():%Y%m%d_%H%M%S}{put.suffix}")
        shutil.copy2(put, kopiya)
        print(f"бэкап: {kopiya.name}")
        for s in primenit(con):
            print("  " + s)
        con.commit()
    pr = proverit(con)
    if pr:
        print(f"\nпретензий: {len(pr)}")
        for p in pr:
            print(" ", p)
        sys.exit(1)
    print("проверка: чисто")


if __name__ == "__main__":
    main()
