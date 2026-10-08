#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Миграция 022 — дерево «Конверсия лид → сделка»: вопросы мест «про нас», квалифицированные лиды.

    python3 022_voprosy_dereva_lid_sdelka.py <путь к atlas.db> [--check]

Решение Дмитрия 50 (08.10.2026, `Map Library 2.0/design/tree_konversiya_lid_sdelka/00_протокол.md`):
вопрос драйвера — с упором на компанию, которая пользуется деревом. Пример Дмитрия — Д2.1:
«Скольким подходящим клиентам интересно с нами встретиться?» не про действующую компанию,
«Какую часть квалифицированных лидов мы записали на встречу?» — управляемая формулировка.
Охват — только это дерево, свод (T-2) не меняется. Термин — «квалифицированные лиды», а не
«подходящие», поэтому выровнены и К1, Д1.3, К2.

Сверх управляемости: прежний вопрос Д2.1 не сходился с числом метрики. В знаменателе Д2.1 есть
квалифицированные лиды, до которых продавец не достучался (они идут в «не согласились»), так что
значение отвечает на «скольких мы записали», а не на «скольким интересно» (T-2, проверка 2).

Что делает — меняет `metric_artifact.question` у семи мест дерева `konversiya-lid-sdelka`:
     К1   544  Сколько заявок мы в итоге передаём в продажи как квалифицированные лиды?
     Д1.3 961  Скольких из тех, с кем поговорили, мы передаём в продажи как квалифицированных лидов?
     К2   538  Скольких квалифицированных лидов мы доводим до встречи?
     Д2.1 962  Какую часть квалифицированных лидов мы записываем на встречу?
     Д2.2 963  Сколько назначенных встреч мы действительно проводим?
     Д3.5 964  Как часто на первой встрече мы говорим с тем, кто принимает решение?
     Д3.4 965  Сколько первых встреч мы проводим с клиентами не по профилю?
Другие места этих метрик (карты, «Финансовая выручка») не трогает: вопрос дерева живёт у места.

Проверки T-2 после правки: ответы детей складываются в вопрос родителя («дозвонились» × «передаём»
= К1, «записываем» × «проводим» = К2), у соседей вопросы разные. 🟡 Вопросы К2 и Д2.1 близки
к пересказу имени (T-2, проверка 1) — названо Дмитрию до решения, выбран термин.

`--check` миграции 021 держит вопросы мест в своём `UZLY` и после 022 пишет «места дерева не как
в UZLY» — ожидаемо, как у 019 после 020, не поломка.

Идемпотентна: повторный запуск ничего не меняет.
"""
import sys, re, sqlite3, shutil, pathlib, datetime

SLUG = "konversiya-lid-sdelka"

# (mid, узел, было, стало)
PRAVKI = [
    (544, "К1",
     "Сколько заявок мы в итоге передаём в продажи как подходящие?",
     "Сколько заявок мы в итоге передаём в продажи как квалифицированные лиды?"),
    (961, "Д1.3",
     "Скольких из тех, с кем поговорили, мы передаём в продажи как подходящих?",
     "Скольких из тех, с кем поговорили, мы передаём в продажи как квалифицированных лидов?"),
    (538, "К2",
     "Скольких подходящих мы доводим до встречи?",
     "Скольких квалифицированных лидов мы доводим до встречи?"),
    (962, "Д2.1",
     "Скольким подходящим клиентам интересно с нами встретиться?",
     "Какую часть квалифицированных лидов мы записываем на встречу?"),
    (963, "Д2.2",
     "Сколько назначенных встреч действительно проходят?",
     "Сколько назначенных встреч мы действительно проводим?"),
    (964, "Д3.5",
     "Как часто на первой встрече есть тот, кто принимает решение?",
     "Как часто на первой встрече мы говорим с тем, кто принимает решение?"),
    (965, "Д3.4",
     "Сколько встреч оказываются с неподходящими клиентами?",
     "Сколько первых встреч мы проводим с клиентами не по профилю?"),
]


def artefakt(con):
    r = con.execute("select id from artifact where slug=? and type='tree'", (SLUG,)).fetchone()
    return r[0] if r else None


def primenit(con):
    aid = artefakt(con)
    if aid is None:
        raise SystemExit(f"✖ дерева {SLUG} нет — сначала миграция 021")
    log = []
    for mid, uzel, bylo, stalo in PRAVKI:
        r = con.execute("select id, question from metric_artifact where artifact_id=? and metric_id=?",
                        (aid, mid)).fetchone()
        if r is None:
            raise SystemExit(f"✖ места {uzel} ({mid}) в дереве нет")
        if r[1] == stalo:
            log.append(f"{uzel} {mid}: уже стоит")
            continue
        if r[1] != bylo:
            raise SystemExit(f"✖ {uzel} ({mid}): вопрос в базе не тот, что «было»: «{r[1]}»")
        con.execute("update metric_artifact set question=? where id=?", (stalo, r[0]))
        log.append(f"{uzel} {mid}: заменён")
    return log


def proverit(con):
    pr = []
    aid = artefakt(con)
    if aid is None:
        return ["⛔ дерева нет"]
    for mid, uzel, bylo, stalo in PRAVKI:
        r = con.execute("select question from metric_artifact where artifact_id=? and metric_id=?",
                        (aid, mid)).fetchone()
        if r is None or r[0] != stalo:
            pr.append(f"⛔ {uzel} ({mid}): вопрос не как в «стало»")
    mesta = con.execute("select metric_id, question from metric_artifact where artifact_id=?", (aid,)).fetchall()
    voprosy = [v for _, v in mesta]
    if len(set(voprosy)) != len(voprosy):
        pr.append("⛔ у двух мест дерева один вопрос")
    for mid, v in mesta:
        if not v or not v.endswith("?") or re.search(r"\*\*|\[\[|<|—", v):
            pr.append(f"⛔ вопрос у места {mid} не годится: «{v}»")
        if "подходящ" in (v or ""):
            pr.append(f"⛔ у места {mid} осталось «подходящих» — термин дерева «квалифицированные лиды»")
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
        kopiya = put.with_name(f"{put.stem}.before_022_{datetime.datetime.now():%Y%m%d_%H%M%S}{put.suffix}")
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
