#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Миграция 019 — вопросы к метрикам.

    python3 019_voprosy_k_metrikam.py <путь к atlas.db> [--check]

Зачем. У каждой метрики Атласа теперь есть набор вопросов, которые помогают разобрать
её и связанные с ней метрики: 8 114 вопросов у всех 902 метрик, от 7 до 19 у каждой.
Образец — вопросы карты метрик ECCO. Набор делали по картам: составитель, два проверяющих
и редактор на каждую карту, правила вопросов и базовый набор утверждены Марией
на калибровке 01.10.2026.

Вопросы показываются в карточке метрики во вкладке «Анализ», под разрезами (решение
Марии, подтверждено 05.10.2026). Группы стоят подзаголовками, у каждой группы подсказка,
что это за вопросы (правило 12; у «Данных и расчёта» подсказка упоминает настройки —
правило 30). Первыми идут базовые: они одинаковы у всех метрик, с них начинают разбор.

Что делает:

  1. Таблица `question_group` — четыре группы: ключ, название, подсказка, порядок показа.
     Подсказки — тексты, утверждённые Марией 05.10.2026.
  2. У `question` новое поле `group_id` → `question_group(id)`.
  3. Таблица `question_base` — шесть базовых вопросов (версия 3, утверждена 01.10.2026).
     Они одни на все метрики, поэтому лежат один раз, а не копией у каждой из 902 метрик:
     `question.metric_id` обязателен, и базовый вопрос без метрики туда не ложится.
  4. Из `question_dimension` удаляются 50 строк, которые ссылаются на вопросы с id 2–63:
     таких вопросов в Базе нет, таблица `question` была пуста (`ATLAS_DB.md`: «пуста»).
     Это остаток старой базы. Если их оставить, новые вопросы с теми же id получили бы
     чужие разрезы. Связь вопросов с разрезами — отдельная работа на потом (Мария, 01.10).
  5. 8 114 вопросов из `019_voprosy_k_metrikam.json` (лежит рядом, читается только здесь).
     `priority` — порядок вопроса внутри метрики, группы идут в порядке `question_group.sort`.
     Поле `answer` пустое: подсказки «как ответить» — потом.

Проверки (`--check`): четыре группы с подсказками, шесть базовых, у каждой метрики от 7
вопросов и у каждого вопроса группа, число вопросов как в файле, висячих строк в
`question_dimension` нет.

Идемпотентна: повторный запуск ничего не меняет.
"""
import sys, sqlite3, shutil, pathlib, datetime, json

DANNYE = pathlib.Path(__file__).with_suffix(".json")

GRUPPY = [  # (id, название, подсказка, порядок)
    ("base", "Базовые",
     "Одни и те же для всех метрик. С них начинают разбор.", 1),
    ("research", "Исследовательские",
     "Помогают найти, где метрика отклоняется и с какими соседними метриками это связано.", 2),
    ("decision", "Управленческие",
     "Вопросы о решении, на которые отвечают данные этой метрики: что поменять и куда направить "
     "деньги и усилия.", 3),
    ("data", "Данные и расчёт",
     "Проверяют, можно ли верить цифре: качество данных, правила расчёта и учёта, а у ставок "
     "и бюджетов ещё и настройки.", 4),
]

BAZOVYE = [
    "Насколько метрика изменилась по сравнению с прошлым периодом и с тем же периодом прошлого года?",
    "Укладывается ли значение метрики в обычные для неё колебания?",
    "Как значение метрики соотносится с планом или целевым диапазоном?",
    "Если метрика изменилась, то когда это началось и как: скачком или постепенно?",
    "Если метрика изменилась, то во всех сегментах одинаково или изменение сосредоточено в одном?",
    "Нет ли в данных за период пропусков, дублей или смены правил учёта?",
]

MINIMUM_U_METRIKI = 7


def kolonki(con, tablica):
    return {r[1] for r in con.execute(f"pragma table_info({tablica})")}


def primenit(con):
    otchet = []
    con.execute("""create table if not exists question_group (
                     id    TEXT PRIMARY KEY,
                     name  TEXT NOT NULL,
                     hint  TEXT NOT NULL,
                     sort  INTEGER NOT NULL)""")
    for gid, imya, podskazka, poryadok in GRUPPY:
        bylo = con.execute("select name, hint, sort from question_group where id=?", (gid,)).fetchone()
        if bylo != (imya, podskazka, poryadok):
            con.execute("insert or replace into question_group values (?,?,?,?)", (gid, imya, podskazka, poryadok))
            otchet.append(f"группа «{imya}»")

    if "group_id" not in kolonki(con, "question"):
        con.execute("alter table question add column group_id TEXT REFERENCES question_group(id)")
        otchet.append("question.group_id")

    con.execute("""create table if not exists question_base (
                     id       INTEGER PRIMARY KEY,
                     priority INTEGER NOT NULL,
                     text     TEXT NOT NULL)""")
    if con.execute("select count(*) from question_base").fetchone()[0] == 0:
        con.executemany("insert into question_base (priority, text) values (?,?)",
                        [(i + 1, t) for i, t in enumerate(BAZOVYE)])
        otchet.append(f"базовых вопросов: {len(BAZOVYE)}")

    visyachie = con.execute("""delete from question_dimension
                               where question_id not in (select id from question)""").rowcount
    if visyachie:
        otchet.append(f"висячих строк question_dimension удалено: {visyachie}")

    if con.execute("select count(*) from question").fetchone()[0] == 0:
        dannye = json.loads(DANNYE.read_text(encoding="utf-8"))
        stroki = [(int(mid), i + 1, tekst, gid)
                  for mid, voprosy in sorted(dannye.items(), key=lambda p: int(p[0]))
                  for i, (gid, tekst) in enumerate(voprosy)]
        con.executemany("insert into question (metric_id, priority, text, group_id) values (?,?,?,?)", stroki)
        otchet.append(f"вопросов: {len(stroki)} у {len(dannye)} метрик")
    return otchet or ["всё уже внесено"]


def proverit(con):
    pr = []
    gruppy = con.execute("select id, name, hint, sort from question_group order by sort").fetchall()
    if gruppy != [tuple(g) for g in GRUPPY]:
        pr.append(f"⛔ группы не те: {gruppy}")
    bazovye = [r[0] for r in con.execute("select text from question_base order by priority")]
    if bazovye != BAZOVYE:
        pr.append(f"⛔ базовые вопросы не те ({len(bazovye)})")

    dannye = json.loads(DANNYE.read_text(encoding="utf-8"))
    nado = sum(len(v) for v in dannye.values())
    est = con.execute("select count(*) from question").fetchone()[0]
    if est != nado:
        pr.append(f"⛔ вопросов {est}, а в файле {nado}")
    bez_gruppy = con.execute("""select count(*) from question q left join question_group g on g.id=q.group_id
                                where g.id is null or q.group_id='base'""").fetchone()[0]
    if bez_gruppy:
        pr.append(f"⛔ вопросов без группы или в базовой: {bez_gruppy}")
    malo = con.execute(f"""select m.name, count(q.id) n from metric m left join question q on q.metric_id=m.id
                           group by m.id having n < {MINIMUM_U_METRIKI}""").fetchall()
    if malo:
        pr.append(f"⛔ метрик с вопросами меньше {MINIMUM_U_METRIKI}: {len(malo)} ({malo[:3]})")
    tekst_ne_tot = 0
    for mid, voprosy in dannye.items():
        v_baze = [tuple(r) for r in con.execute(
            "select group_id, text from question where metric_id=? order by priority", (int(mid),))]
        if v_baze != [tuple(v) for v in voprosy]:
            tekst_ne_tot += 1
    if tekst_ne_tot:
        pr.append(f"⛔ у {tekst_ne_tot} метрик вопросы расходятся с файлом")
    visyachie = con.execute("""select count(*) from question_dimension
                               where question_id not in (select id from question)""").fetchone()[0]
    if visyachie:
        pr.append(f"⛔ висячих строк question_dimension: {visyachie}")
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
        kopiya = put.with_name(f"{put.stem}.before_019_{datetime.datetime.now():%Y%m%d_%H%M%S}{put.suffix}")
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
