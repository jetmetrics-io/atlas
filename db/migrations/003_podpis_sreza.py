#!/usr/bin/env python3
"""Миграция 003 — подпись среза на месте метрики.

Зачем. Миграция 001 завела на месте пару «разрез × значение»: label_dimension_id
и label_value. Значение берётся из справочника ДОСЛОВНО — `повторный`. Но в дереве
под именем метрики показывается не оно, а подпись: «По повторным клиентам».

Это две разные вещи, и обе нужны (решение Дмитрия 22.09):
  label_dimension_id + label_value  — чем отфильтровано, привязка к справочнику
  label_text                        — как это читается в интерфейсе

Подпись не выводится из значения автоматически: приложение печатает готовую строку
(`<Srez label={n.label} />` в TreeView). До этой миграции она жила только в спеке
дерева, то есть в файле — при сборке выгрузки из базы потерялась бы.

Что добавляет:
  label_text  TEXT   подпись среза, как она показывается под именем метрики

NULL при заполненной паре разрез+значение — не брак: значит подпись не задана
и её рисует сборщик. Заполнен label_text без разреза — брак, ловится проверкой.

Запуск:
    python3 003_podpis_sreza.py ../atlas.db <путь к app/public/data>
    python3 003_podpis_sreza.py ../atlas.db <путь> --check
"""
import json, sqlite3, sys, shutil, datetime, pathlib


def stolbcy(con, tabl):
    return {r[1] for r in con.execute(f"pragma table_info({tabl})")}


def primenit(con, data_dir):
    otchet = []
    if "label_text" not in stolbcy(con, "metric_artifact"):
        con.execute("alter table metric_artifact add column label_text TEXT")
        otchet.append("колонка label_text добавлена")
    else:
        otchet.append("колонка label_text уже была")

    a = json.load(open(f"{data_dir}/atlas_full.json", encoding="utf-8"))
    zapolneno = 0
    for n in a["nodes"]:
        podpis = n.get("label")
        if not podpis:
            continue
        est = con.execute("select label_text from metric_artifact where node_id=?",
                          (n["id"],)).fetchone()
        if est is None:
            continue                      # места нет в базе — не наше дело
        if est[0] != podpis:
            con.execute("update metric_artifact set label_text=? where node_id=?",
                        (podpis, n["id"]))
            zapolneno += 1
    otchet.append(f"подписей проставлено: {zapolneno}")
    return otchet


def proverit(con):
    if "label_text" not in stolbcy(con, "metric_artifact"):
        return ["⛔ колонки label_text нет"]
    pretenzii = []
    sirota = con.execute("""select count(*) from metric_artifact
                            where label_text is not null and label_dimension_id is null""").fetchone()[0]
    if sirota:
        pretenzii.append(f"⛔ подпись без разреза: {sirota} мест")
    return pretenzii


def main():
    if len(sys.argv) < 3: sys.exit(__doc__)
    db, data_dir = sys.argv[1], sys.argv[2]
    con = sqlite3.connect(db)
    con.execute("pragma foreign_keys=on")
    if "--check" not in sys.argv:
        kopiya = f"{db.rsplit('.db',1)[0]}.before_003_{datetime.datetime.now():%Y%m%d_%H%M%S}.db"
        shutil.copy(db, kopiya)
        print(f"бэкап: {pathlib.Path(kopiya).name}")
        for s in primenit(con, data_dir): print("  " + s)
        con.commit()
    pret = proverit(con)
    for p in pret: print(p)
    print("проверка: чисто" if not pret else "проверка: есть претензии")


if __name__ == "__main__":
    main()
