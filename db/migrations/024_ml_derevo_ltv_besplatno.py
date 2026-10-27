#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Миграция 024 — Map Library (EN): дерево «Customer lifetime value (LTV)» бесплатно.

    python3 024_ml_derevo_ltv_besplatno.py <путь к atlas.db> [--check]

Решение Марии 27.10.2026 (сайт jetmetrics.io, у каждого продукта бесплатная версия): из деревьев
Map Library без подписки открыто одно — LTV целиком; «Revenue from repeat customers» и
«Lead-to-deal conversion» (и будущие AOV, CR) — по подписке, как платные карты.

Что делает — `artifact_en.access` у дерева `ltv` (artifact 39): 'paid' → 'free'. Это английский
доступ: `scripts/build_en.py` подставляет его вместо `artifact.access` только в английской выгрузке.
Русский Атлас не меняется: `artifact.access` у дерева остаётся 'paid'.

Идемпотентна: повторный запуск ничего не меняет.
"""
import sys, sqlite3, shutil, pathlib, datetime

SLUG = "ltv"


def artefakt(con):
    r = con.execute("select id from artifact where slug=? and type='tree'", (SLUG,)).fetchone()
    return r[0] if r else None


def primenit(con):
    aid = artefakt(con)
    if aid is None:
        raise SystemExit(f"✖ дерева {SLUG} нет")
    r = con.execute("select access from artifact_en where artifact_id=?", (aid,)).fetchone()
    if r is None:
        raise SystemExit(f"✖ у дерева {SLUG} нет английской строки — сначала миграция 023")
    if r[0] == "free":
        return [f"{SLUG}: уже бесплатно"]
    con.execute("update artifact_en set access='free' where artifact_id=?", (aid,))
    return [f"{SLUG}: {r[0]} → free (только Map Library)"]


def proverit(con):
    pr = []
    aid = artefakt(con)
    if aid is None:
        return ["⛔ дерева нет"]
    en = con.execute("select access from artifact_en where artifact_id=?", (aid,)).fetchone()
    ru = con.execute("select access from artifact where id=?", (aid,)).fetchone()
    if not en or en[0] != "free":
        pr.append("⛔ в Map Library дерево LTV не бесплатно")
    if not ru or ru[0] != "paid":
        pr.append("⛔ в русском Атласе доступ дерева LTV изменился — миграция его не трогает")
    drugie = con.execute("""select a.slug, e.access from artifact a join artifact_en e on e.artifact_id = a.id
                            where a.type='tree' and a.slug in ('vyruchka-s-povtornyh', 'konversiya-lid-sdelka')""").fetchall()
    for slug, access in drugie:
        if access != "paid":
            pr.append(f"⛔ дерево {slug} в Map Library не по подписке")
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
        kopiya = put.with_name(f"{put.stem}.before_024_{datetime.datetime.now():%Y%m%d_%H%M%S}{put.suffix}")
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
