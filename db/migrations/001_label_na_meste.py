#!/usr/bin/env python3
"""Миграция 001 — label на месте метрики.

Зачем. Дерево драйверов сплошь и рядом просит не метрику вообще, а метрику в конкретном
срезе: «Заказов на клиента» именно у повторных, «% возвратов» именно у повторных. Заводить
под это отдельные карточки нельзя — правило RULES.md «Карточка или label: решает не срез,
а процесс за ним» (16.09.2026): своих затрат и своего результата у такого значения нет,
значит это то же самое число под фильтром, а не новый показатель.

Где живёт. В metric_artifact, потому что label — свойство ПАРЫ «метрика × место», а не
метрики. Одна и та же «Заказов на клиента» стоит на карте CRM без фильтра и в дереве
выручки с повторных с фильтром «повторный». Метрика одна, текст карточки один, мест два.
Ровно та же логика, по которой 27.08 в metric_artifact переехала role.

Что добавляет:
  label_dimension_id  INTEGER → dimension(id)   какой разрез фильтрует
  label_value         TEXT                      каким значением разреза

Оба NULL — обычное место, метрика целиком. Оба заполнены — место показывает срез.
Заполнен один из двух — брак, ловится валидатором.

⛔ Своих формулировок разреза не бывает. label_dimension_id ссылается на справочник
`site-state/atlas/разрезы.md`, значение берётся из dimension.variants дословно.

Запуск:
    python3 001_label_na_meste.py ../atlas.db            # применить
    python3 001_label_na_meste.py ../atlas.db --check    # только проверить, ничего не менять

Идемпотентна: повторный запуск ничего не ломает.
"""
import sqlite3, sys, shutil, datetime, pathlib

RAZDELITEL = " · "          # так разделены значения в dimension.variants
NOVYE = {
    "label_dimension_id": "INTEGER REFERENCES dimension(id)",
    "label_value":        "TEXT",
}


def stolbcy(con, tabl):
    return {r[1] for r in con.execute(f"pragma table_info({tabl})")}


def varianty(stroka):
    """Значения разреза списком. Пустой список — основание открытое, проверять нечем.

    У части разрезов в variants не перечисление, а описание принципа: «Сегмент покупателя»
    режут по тому, что предсказывает поведение клиентов у конкретной компании. Такие
    значения валидатор пропускает: сверять не с чем.
    """
    if not stroka:
        return []
    znacheniya = [z.strip() for z in stroka.split(RAZDELITEL) if z.strip()]
    if len(znacheniya) < 2:
        return []
    if any(len(z) > 60 for z in znacheniya):
        return []
    return znacheniya


def primenit(con):
    est = stolbcy(con, "metric_artifact")
    dobavleno = []
    for imya, tip in NOVYE.items():
        if imya in est:
            continue
        con.execute(f'alter table metric_artifact add column {imya} {tip}')
        dobavleno.append(imya)
    con.execute("""create index if not exists idx_metric_artifact_label
                   on metric_artifact(label_dimension_id, label_value)""")
    return dobavleno


def proverit(con):
    """Возвращает список претензий. Пустой список — всё чисто."""
    est = stolbcy(con, "metric_artifact")
    if not NOVYE.keys() <= est:
        return [f"⛔ колонок нет: {', '.join(sorted(NOVYE.keys() - est))}"]

    pretenzii = []

    polovinchatye = con.execute("""
        select node_id, label_dimension_id, label_value from metric_artifact
        where (label_dimension_id is null) != (label_value is null)""").fetchall()
    for node_id, did, val in polovinchatye:
        pretenzii.append(f"⛔ {node_id}: заполнена половина label (разрез={did}, значение={val!r})")

    razrezy = {r[0]: (r[1], r[2]) for r in con.execute("select id, name, variants from dimension")}
    pomechennye = con.execute("""
        select node_id, label_dimension_id, label_value from metric_artifact
        where label_dimension_id is not null""").fetchall()

    for node_id, did, val in pomechennye:
        if did not in razrezy:
            pretenzii.append(f"⛔ {node_id}: разреза id={did} нет в справочнике")
            continue
        imya, var_stroka = razrezy[did]
        dopustimye = varianty(var_stroka)
        if dopustimye and val not in dopustimye:
            pretenzii.append(
                f"⛔ {node_id}: значение {val!r} не из разреза «{imya}». "
                f"Допустимые: {', '.join(dopustimye)}")

    # Срез обязан быть связан с родительской метрикой (RULES.md, «Срез отдельной метрикой»).
    for node_id, did, val in pomechennye:
        ma_id = con.execute("select id from metric_artifact where node_id=?", (node_id,)).fetchone()
        if not ma_id:
            continue
        svyaz = con.execute("""select count(*) from metric_metric
                               where (source_id=? or target_id=?) and type in ('rollup','kin')""",
                            (ma_id[0], ma_id[0])).fetchone()
        if svyaz and svyaz[0] == 0:
            pretenzii.append(f"⚠️ {node_id}: срез без связи rollup с родительской метрикой")

    return pretenzii


def svodka(con):
    vsego = con.execute("select count(*) from metric_artifact").fetchone()[0]
    if not NOVYE.keys() <= stolbcy(con, "metric_artifact"):
        return f"мест всего: {vsego}, колонок label нет"
    srezov = con.execute("""select count(*) from metric_artifact
                            where label_dimension_id is not null""").fetchone()[0]
    return f"мест всего: {vsego}, из них срезов: {srezov}"


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
        kopiya = put.with_name(f"{put.stem}.before_001_{metka}{put.suffix}")
        shutil.copy2(put, kopiya)
        print(f"копия до правки: {kopiya.name}")

        dobavleno = primenit(con)
        con.commit()
        if dobavleno:
            print(f"добавлены колонки: {', '.join(dobavleno)}")
        else:
            print("колонки уже были, схема не менялась")

    print(svodka(con))
    pretenzii = proverit(con)
    if pretenzii:
        print(f"\nпретензий: {len(pretenzii)}")
        for p in pretenzii:
            print(" ", p)
        sys.exit(1)
    print("проверка: чисто")


if __name__ == "__main__":
    main()
