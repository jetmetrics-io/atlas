#!/usr/bin/env python3
"""Что сейчас в бою и чем оно отличается от того, что у меня на руках.

    python3 scripts/atlas_pull.py                 # показать разницу
    python3 scripts/atlas_pull.py --save .rollback # ещё и сохранить слепок боя

Обратная дорога конвейера: Облако → локальная машина. Ничего не меняет, только
показывает. Отвечает на два вопроса, которые иначе выясняются постфактум:

* **Не ушёл ли бой вперёд?** Пока я правил Базу, кто-то мог выложить своё.
  Выложу поверх — сотру чужую работу.
* **Что именно уедет,** если выложить сейчас: сколько метрик прибавится,
  какие переименуются, какие артефакты появятся или исчезнут.

Этот же файл работает предполётной проверкой в `deploy_storage.py`: там он
сравнивает бой с готовой сборкой и останавливает выкладку, если сборка пустая
или вдруг теряет артефакты.
"""
import json, sys, pathlib, urllib.request, argparse, datetime

BAKET = "https://storage.yandexcloud.net/jetmetrics-static/atlas"
FAYLY = ["data/atlas_full.json", "data/atlas_free.json",
         "data/content_full.json", "data/content_free.json", "index.html"]


def skachat(put):
    """Тянем с меткой времени: кэш на бакете агрессивный, без неё можно получить вчерашнее."""
    metka = int(datetime.datetime.now().timestamp())
    with urllib.request.urlopen(f"{BAKET}/{put}?v={metka}", timeout=30) as r:
        return r.read()


def boy():
    dannye = {}
    for f in FAYLY:
        syroe = skachat(f)
        dannye[f] = json.loads(syroe) if f.endswith(".json") else syroe.decode("utf-8", "replace")
    return dannye


def mestnoe(papka):
    p = pathlib.Path(papka)
    out = {}
    for f in FAYLY:
        imya = f.split("/")[-1]
        fayl = p / imya if (p / imya).exists() else p / f
        if fayl.exists():
            out[f] = json.loads(fayl.read_text(encoding="utf-8")) if f.endswith(".json") \
                     else fayl.read_text(encoding="utf-8")
    return out


def sravnit(tam, tut):
    """Разница в понятных человеку единицах: метрики, имена, артефакты."""
    otchet, trevogi = [], []
    ta, tu = tam.get("data/atlas_full.json"), tut.get("data/atlas_full.json")
    if not ta or not tu:
        return ["не с чем сравнивать"], ["⛔ нет выгрузки с одной из сторон"]

    otchet.append(f"дата сборки: бой {ta['meta']['updated']} · у нас {tu['meta']['updated']}")
    for pole, imya in (("metrics", "метрик"), ("nodes", "узлов"), ("edges", "связей"),
                       ("sections", "карт"), ("trees", "деревьев")):
        b, n = ta["meta"][pole], tu["meta"][pole]
        if b != n:
            otchet.append(f"{imya}: бой {b} → станет {n}  ({n-b:+d})")

    # артефакты: появятся или пропадут
    ba = {(t["slug"], t["name"]) for t in ta["trees"]} | {(s["slug"], s["name"]) for s in ta["sections"]}
    na = {(t["slug"], t["name"]) for t in tu["trees"]} | {(s["slug"], s["name"]) for s in tu["sections"]}
    for slug, imya in sorted(na - ba):
        otchet.append(f"  + появится: «{imya}» ({slug})")
    for slug, imya in sorted(ba - na):
        trevogi.append(f"⚠️ ПРОПАДЁТ артефакт «{imya}» ({slug}) — так задумано?")

    # метрики и переименования
    bm = {n["mid"]: n["name"] for n in ta["nodes"]}
    nm = {n["mid"]: n["name"] for n in tu["nodes"]}
    novye = sorted(set(nm) - set(bm))
    ushli = sorted(set(bm) - set(nm))
    for mid in novye:
        otchet.append(f"  + метрика mid {mid}: «{nm[mid]}»")
    for mid in ushli:
        trevogi.append(f"⚠️ ИСЧЕЗНЕТ метрика mid {mid}: «{bm[mid]}»")
    pereimenovany = [(mid, bm[mid], nm[mid]) for mid in set(bm) & set(nm) if bm[mid] != nm[mid]]
    for mid, bylo, stalo in pereimenovany:
        otchet.append(f"  ~ mid {mid}: «{bylo}» → «{stalo}»")

    # рассинхрон бесплатной и полной выгрузки — та самая ошибка 22.09
    for storona, d in (("бой", tam), ("у нас", tut)):
        full, free = d.get("data/atlas_full.json"), d.get("data/atlas_free.json")
        if not full or not free:
            continue
        imena_full = {n["id"]: n["name"] for n in full["nodes"]}
        raznica = [nid for nid, im in ((n["id"], n["name"]) for n in free["nodes"])
                   if imena_full.get(nid) and imena_full[nid] != im]
        if raznica:
            trevogi.append(f"⚠️ {storona}: бесплатная выгрузка разошлась с полной "
                           f"в {len(raznica)} узлах ({', '.join(raznica[:3])})")
    return otchet, trevogi


def main():
    p = argparse.ArgumentParser(description="Сверить бой с локальной выгрузкой")
    p.add_argument("--data", default=str(pathlib.Path(__file__).resolve().parent.parent / "public" / "data"))
    p.add_argument("--save", help="сохранить слепок боя в эту папку (для отката)")
    a = p.parse_args()

    print(f"── Тяну бой: {BAKET} ──")
    tam = boy()
    print(f"   боевая выгрузка от {tam['data/atlas_full.json']['meta']['updated']}, "
          f"метрик {tam['data/atlas_full.json']['meta']['metrics']}")

    if a.save:
        papka = pathlib.Path(a.save)
        papka.mkdir(parents=True, exist_ok=True)
        for f in FAYLY:
            cel = papka / f
            cel.parent.mkdir(parents=True, exist_ok=True)
            soderzhimoe = tam[f]
            cel.write_text(json.dumps(soderzhimoe, ensure_ascii=False) if f.endswith(".json")
                           else soderzhimoe, encoding="utf-8")
        (papka / "снято.txt").write_text(
            f"Слепок боя {datetime.datetime.now():%Y-%m-%d %H:%M}\n"
            f"Откат: положить эти файлы обратно командой\n"
            f"  python3 scripts/deploy_storage.py --rollback {papka}\n", encoding="utf-8")
        print(f"   слепок сохранён: {papka}")

    tut = mestnoe(a.data)
    if not tut:
        print(f"\n✖ Локальной выгрузки нет в {a.data} — собрать: npm run gen")
        return 1

    print(f"\n── Что изменится, если выложить сейчас ──")
    otchet, trevogi = sravnit(tam, tut)
    for s in otchet:
        print("   " + s)
    if not any(s.startswith(("  +", "  ~")) for s in otchet) and len(otchet) <= 1:
        print("   разницы нет: бой и локальная выгрузка совпадают")
    if trevogi:
        print()
        for t in trevogi:
            print("   " + t)
    return 2 if trevogi else 0


if __name__ == "__main__":
    sys.exit(main())
