#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Миграция 008 — вопрос дерева на месте метрики. Первым его получает дерево LTV.

    python3 008_vopros_na_meste.py <путь к atlas.db> [--check]

Зачем. По канону дерева узел — это пара «вопрос и метрика, которая на него отвечает»
(свод `methodology/TREE.md`, T-2): «Средний чек» отвечает на «Сколько покупатель тратит
за один заказ?». В приложении вопросы показывает панель «Вопросы дерева» справа
от холста (решение Дмитрия 25.09.2026). В карточке метрики вопроса нет: карточка общая
для всех артефактов и описывает метрику, а не её место в дереве (Дмитрий 26.09).

Где живёт. Колонка `question` в metric_artifact: вопрос — свойство места, а не метрики.
«Средняя фактическая скидка» в дереве LTV и та же метрика в другом дереве могут отвечать
на разные вопросы. По той же логике в metric_artifact живут role, group и label.
Отдельную таблицу «место, модель, текст» Дмитрий отклонил 26.09. Вопрос у места один
на все модели бизнеса, и у общего узла формулировка тоже одна.

Таблица `question` для этого не подходит: её вопросы привязаны к метрике.

Что добавляет:
  question  TEXT   вопрос дерева у этого места. Пусто у мест карт и у деревьев,
                   которым вопросы ещё не написаны.

Тексты дерева LTV взяты дословно из спек редакции 14 (`design/trees_ltv/spec/дерево_1.json`,
`дерево_3.json`, поле `question`); узел спеки указан в комментарии у каждой строки.
У пяти общих узлов в спеках было по две формулировки, и из двух взята одна:
  - 518, 930, 625 — из Дерева 1, про «клиента». Это пример Дмитрия в T-2: «сколько
    прибыли мы получим с одного клиента?», «насколько прибылен каждый клиент», «как долго
    клиент остаётся с нами». «Клиент» годится для обеих моделей, и имя корня его содержит:
    «Пожизненная ценность клиента». «Покупатель» в подписке звучал бы странно.
  - 929 «Средняя фактическая скидка» — из Дерева 3: «от цены» подходит обеим моделям,
    а «от прайса» — только подписке. Промокоды, акции и баллы — список из карточки 929.
  - 944 — формулировка Дерева 3 «с каждого рубля»: по решению 25.09 это доля выручки.

Проверки (они же валидатор, `--check`):
  - в дереве, где есть хотя бы один вопрос, вопрос есть у каждого места: иначе панель
    покажет вместо вопроса имя метрики;
  - вопрос кончается знаком «?» и не повторяет имя метрики (T-2, проверка 1);
  - у соседей — детей одного родителя — вопросы разные (T-2, проверка 4);
  - в вопросе нет разметки `**`, `[[`, `<`: панель показывает его простым текстом;
  - у мест карт вопроса нет: карта вопросы не показывает.

Идемпотентна: повторный запуск ничего не дублирует и не портит.
"""
import sys, sqlite3, shutil, pathlib, datetime

SLUG = "ltv"

# mid → вопрос. У каждой строки — узел спеки ред. 14, откуда текст взят дословно.
VOPROSY = {
    518: "Сколько прибыли мы получим с одного клиента?",                        # Д1 k (Д3 k — «покупателя»)
    930: "Насколько прибылен каждый клиент?",                                   # Д1 c1 (Д3 c1 — «каждая покупка»)
    934: "Сколько клиент платит нам за месяц?",                                 # Д1 c2
    198: "Сколько покупатель тратит за один заказ?",                            # Д3 c2
    947: "Как часто покупатель у нас заказывает?",                              # Д3 c3
    625: "Как долго клиент остаётся с нами?",                                   # Д1 c3 (Д3 c4 — «покупатель»)
    942: "Сколько из каждого рубля выручки уходит на закупку товара?",          # Д3 d1.1
    931: "Во что нам обходятся серверы и сторонние сервисы на одного клиента?", # Д1 d1.1
    294: "Во что нам обходится собрать и упаковать один заказ?",                # Д3 d1.2
    932: "Во что нам обходится поддержка одного клиента?",                      # Д1 d1.2
    943: "Во что нам обходится доставить один заказ?",                          # Д3 d1.3
    944: "Сколько мы отдаём за приём оплаты с каждого рубля?",                  # Д3 d1.4
    933: "Во что нам обходится сопровождение одного клиента?",                  # Д1 d1.4
    945: "Во что нам обходятся возвраты в расчёте на один заказ?",              # Д3 d1.5
    946: "Во что нам обходится поддержка в расчёте на один заказ?",             # Д3 d1.6
    919: "Сколько в среднем стоит подписка по нашей сетке?",                    # Д1 d2.1
    161: "Сколько разных товаров покупатель кладёт в один заказ?",              # Д3 d2.1
    927: "Сколько штук каждого товара он берёт?",                               # Д3 d2.2
    928: "Сколько в среднем стоит одна купленная штука без скидок?",            # Д3 d2.3
    929: "Сколько мы уступаем от цены промокодами, акциями и баллами?",         # Д3 d2.4 (Д1 d2.2 — «от прайса»)
    948: "Как часто покупатель к нам заходит?",                                 # Д3 d3.1
    949: "Сколько визитов заканчиваются заказом?",                              # Д3 d3.2
    950: "Какую часть оформленных заказов покупатели забирают?",                # Д3 d3.3
    951: "До скольких покупателей мы можем дотянуться рассылкой?",              # Д3 d3.4
    935: "Поняли ли клиенты, как продукт им поможет?",                          # Д1 d3.1
    936: "Часто ли клиенты пользуются продуктом?",                              # Д1 d3.2
    937: "Много ли возможностей продукта используют клиенты?",                  # Д1 d3.3
    938: "Довольны ли клиенты?",                                                # Д1 d3.4
    939: "Сколько новых клиентов продлевают подписку на второй месяц?",         # Д1 d3.5
    940: "Сколько клиентов продлевают подписку от месяца X до месяца Y?",       # Д1 d3.6
    941: "Сколько клиентов мы теряем только потому, что не прошла оплата?",     # Д1 d3.7
    952: "Сколько новых покупателей возвращаются за вторым заказом?",           # Д3 d4.1
    953: "Сколько постоянных покупателей мы теряем каждый месяц?",              # Д3 d4.2
    413: "Приходят ли заказы вовремя?",                                         # Д3 d4.3
    954: "Довольны ли покупатели?",                                             # Д3 d4.4
    955: "Держит ли покупателей программа лояльности?",                         # Д3 d4.5
}


def stolbcy(con, tabl):
    return {r[1] for r in con.execute(f"pragma table_info({tabl})")}


def primenit(con):
    """Добавляет колонку и ставит вопросы дерева LTV. Возвращает (добавлена ли колонка,
    сколько вопросов поставлено, сколько уже стояло)."""
    dobavlena = False
    if "question" not in stolbcy(con, "metric_artifact"):
        con.execute("alter table metric_artifact add column question TEXT")
        dobavlena = True
    art = con.execute("select id from artifact where slug=? and type='tree'", (SLUG,)).fetchone()
    if not art:
        sys.exit(f"✖ дерева «{SLUG}» нет в базе — сначала миграция 007")
    postavleno = stoyalo = 0
    for mid, tekst in VOPROSY.items():
        r = con.execute("select id, question from metric_artifact where artifact_id=? and metric_id=?",
                        (art[0], mid)).fetchone()
        if not r:
            sys.exit(f"✖ в дереве «{SLUG}» нет места метрики {mid} — вопросы не ставлю")
        if r[1] == tekst:
            stoyalo += 1
            continue
        con.execute("update metric_artifact set question=? where id=?", (tekst, r[0]))
        postavleno += 1
    return dobavlena, postavleno, stoyalo


def proverit(con):
    """Список претензий. Пустой список — всё чисто."""
    if "question" not in stolbcy(con, "metric_artifact"):
        return ["⛔ колонки question в metric_artifact нет"]
    pretenzii = []

    na_kartah = con.execute("""select pa.node_id from metric_artifact pa join artifact a on a.id = pa.artifact_id
                               where a.type = 'map' and coalesce(trim(pa.question), '') != ''""").fetchall()
    for (node_id,) in na_kartah:
        pretenzii.append(f"⛔ {node_id}: вопрос у места на карте — карта вопросы не показывает")

    derevya = con.execute("""select distinct a.id, a.name from artifact a join metric_artifact pa on pa.artifact_id = a.id
                             where a.type = 'tree' and coalesce(trim(pa.question), '') != ''""").fetchall()
    for art_id, art_name in derevya:
        mesta = con.execute("""select pa.id, pa.node_id, m.name, pa.question from metric_artifact pa
                               join metric m on m.id = pa.metric_id where pa.artifact_id = ?""", (art_id,)).fetchall()
        for pid, node_id, imya, q in mesta:
            q = (q or "").strip()
            if not q:
                pretenzii.append(f"⛔ «{art_name}»: у {node_id} («{imya}») нет вопроса, а у соседей по дереву есть")
                continue
            if not q.endswith("?"):
                pretenzii.append(f"⛔ {node_id}: вопрос не кончается «?» — {q!r}")
            if q.rstrip("?").strip().lower() == imya.strip().lower():
                pretenzii.append(f"⛔ {node_id}: вопрос повторяет имя метрики (T-2, проверка 1)")
            if any(z in q for z in ("**", "[[", "<", ">")):
                pretenzii.append(f"⛔ {node_id}: в вопросе разметка — панель показывает простой текст")
        # соседи: дети одного родителя (связи дерева идут от ребёнка к родителю)
        deti = {}
        for src, tgt in con.execute("""select e.source_id, e.target_id from metric_metric e
                                       join metric_artifact s on s.id = e.source_id
                                       where s.artifact_id = ?""", (art_id,)):
            deti.setdefault(tgt, []).append(src)
        vopros = {pid: (node_id, (q or "").strip()) for pid, node_id, _, q in mesta}
        for rod, kids in deti.items():
            vidennye = {}
            for k in kids:
                if k not in vopros or not vopros[k][1]:
                    continue
                node_id, q = vopros[k]
                if q in vidennye:
                    pretenzii.append(f"⛔ «{art_name}»: у соседей {vidennye[q]} и {node_id} один вопрос (T-2, проверка 4)")
                vidennye[q] = node_id
    return pretenzii


def svodka(con):
    if "question" not in stolbcy(con, "metric_artifact"):
        return "колонки question нет"
    s_voprosom = con.execute("select count(*) from metric_artifact where coalesce(trim(question), '') != ''").fetchone()[0]
    derevyev = con.execute("""select count(distinct artifact_id) from metric_artifact
                              where coalesce(trim(question), '') != ''""").fetchone()[0]
    return f"мест с вопросом: {s_voprosom}, деревьев с вопросами: {derevyev}"


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
        kopiya = put.with_name(f"{put.stem}.before_008_{metka}{put.suffix}")
        shutil.copy2(put, kopiya)
        print(f"бэкап: {kopiya.name}")
        dobavlena, postavleno, stoyalo = primenit(con)
        con.commit()
        print("колонка question добавлена" if dobavlena else "колонка question уже была")
        print(f"  вопросов дерева «{SLUG}»: поставлено {postavleno}, уже стояло {stoyalo}")

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
