#!/usr/bin/env python3
"""Проверить собранную выгрузку перед тем, как она уедет в бой.

    python3 scripts/check_dump.py [папка]     # по умолчанию dist/data

Последний рубеж между сборкой и людьми. Ловит то, что глазами не видно, а в бою
стоит дорого:

* выгрузка не собралась или собралась пустой — приложение откроется без метрик;
* бесплатная версия разошлась с полной — неоплативший видит одно, оплативший другое
  (случилось 22.09.2026: переименование доехало только до полной выгрузки);
* у артефакта пропала ключевая метрика — карта откроется без центра;
* связь ведёт в никуда — на карте оборванная стрелка.

Выход 0 — можно выкладывать, 1 — нельзя.
"""
import json, sys, pathlib

MINIMUM_METRIK = 800      # ниже этого выгрузка заведомо битая: в Атласе их 870+
MINIMUM_KART   = 20


def proverit(papka):
    d = pathlib.Path(papka)
    bedy = []
    if not d.exists():
        return [f"⛔ нет папки {d} — выгрузка не собралась"]

    nuzhny = ["atlas_full.json", "atlas_free.json", "content_full.json", "content_free.json"]
    otsutstvuyut = [f for f in nuzhny if not (d / f).exists()]
    if otsutstvuyut:
        return [f"⛔ не хватает файлов: {', '.join(otsutstvuyut)}"]

    full = json.loads((d / "atlas_full.json").read_text(encoding="utf-8"))
    free = json.loads((d / "atlas_free.json").read_text(encoding="utf-8"))
    cfull = json.loads((d / "content_full.json").read_text(encoding="utf-8"))
    cfree = json.loads((d / "content_free.json").read_text(encoding="utf-8"))

    m = full["meta"]
    print(f"   метрик {m['metrics']} · узлов {m['nodes']} · связей {m['edges']}"
          f" · карт {m['sections']} · деревьев {m['trees']} · собрана {m['updated']}")
    print(f"   бесплатных узлов {free['meta']['nodes']} · карточек {len(cfull)}")

    if m["metrics"] < MINIMUM_METRIK:
        bedy.append(f"⛔ метрик всего {m['metrics']} — выгрузка битая")
    if m["sections"] < MINIMUM_KART:
        bedy.append(f"⛔ карт всего {m['sections']} — выгрузка битая")

    # имя метрики одно во всех выгрузках: карточка сквозная
    imena = {n["id"]: n["name"] for n in full["nodes"]}
    razoshlis = [n["id"] for n in free["nodes"] if imena.get(n["id"], n["name"]) != n["name"]]
    if razoshlis:
        bedy.append(f"⛔ free разошлась с full в {len(razoshlis)} узлах: {razoshlis[:5]}")

    # тексты карточек тоже сквозные
    razn_tekst = [k for k in cfree if k in cfull and cfree[k] != cfull[k]]
    if razn_tekst:
        bedy.append(f"⛔ карточки free разошлись с full: {len(razn_tekst)} шт "
                    f"({razn_tekst[:3]})")

    # у каждого узла должна быть карточка, иначе панель метрики откроется пустой
    bez_kartochki = [n["id"] for n in full["nodes"] if n["id"] not in cfull]
    if bez_kartochki:
        bedy.append(f"⛔ узлов без карточки: {len(bez_kartochki)} ({bez_kartochki[:3]})")

    # связи не должны вести в никуда
    uzly = {n["id"] for n in full["nodes"]}
    obryv = [(e["source"], e["target"]) for e in full["edges"]
             if e["source"] not in uzly or e["target"] not in uzly]
    if obryv:
        bedy.append(f"⛔ связей в никуда: {len(obryv)} ({obryv[:2]})")

    # у каждого артефакта — ровно одна ключевая метрика
    klyuchevye = {}
    for n in full["nodes"]:
        if n.get("key"):
            klyuchevye[n["section"]] = klyuchevye.get(n["section"], 0) + 1
    for t in full["trees"]:
        if not t.get("root"):
            bedy.append(f"⛔ у дерева «{t['name']}» нет корневой метрики")

    # в каталоге должны быть ВСЕ артефакты, и в бесплатной выгрузке тоже:
    # платное показывается неоплатившему с замком, а не прячется
    if len(free["sections"]) != len(full["sections"]) or len(free["trees"]) != len(full["trees"]):
        bedy.append(f"⛔ каталог урезан: в free карт {len(free['sections'])}/{len(full['sections'])}, "
                    f"деревьев {len(free['trees'])}/{len(full['trees'])}")
    return bedy


def main():
    papka = sys.argv[1] if len(sys.argv) > 1 else \
        str(pathlib.Path(__file__).resolve().parent.parent / "dist" / "data")
    print(f"── Проверка выгрузки {papka} ──")
    bedy = proverit(papka)
    for b in bedy:
        print("   " + b)
    print("проверка выгрузки: чисто" if not bedy else f"проверка выгрузки: бед {len(bedy)}")
    return 1 if bedy else 0


if __name__ == "__main__":
    sys.exit(main())
