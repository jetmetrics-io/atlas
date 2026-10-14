#!/usr/bin/env python3
"""Собрать английскую выгрузку (Map Library 2.0) из Базы: db/atlas.db → <out>/*.json

    python3 scripts/build_en.py [--db db/atlas.db] [--out dist-en/data]

Сборщик тот же, `build_app.py`, и русская выгрузка от этого файла не зависит. Здесь только
подстановка: копия Базы во временный файл → русский текст в ней заменяется английским
из таблиц `*_en` (миграция 023_map_library_en) → `build_app.sobrat()` по этой копии.

Что подставляется и что выкидывается:
- Остаются только артефакты с `artifact_en.visible = 1`; остальные места, их связи и метрики,
  которые больше нигде не стоят, из копии удаляются. Карты, скрытые в английской версии
  (Финансы, Маркетплейсы, разбор чистой прибыли), туда так и не попадают.
- Название и доступ артефакта, семьи, разрезы, группы вопросов, базовые вопросы — из `*_en`.
- Карточка метрики, заметки разрезов, вопросы — из `*_en`; русское поле без английского —
  ошибка сборки (иначе русский текст уедет к англоязычному читателю).
- Ссылки `[[Имя→узел]]` на места, которых в английской версии нет, становятся просто текстом.
- Коды остаются русскими: единица (Количество, %, Деньги, Время), суть (больше-лучше…),
  роли, ключи полей карточки. Подписи к ним переводит интерфейс.
- Отпечаток русского текста (`src_hash`) сверяется с текущим русским: расхождение — перевод
  устарел, сборка его называет (но не падает).
"""
import argparse, hashlib, json, pathlib, re, shutil, sqlite3, sys, tempfile

KORNI = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(KORNI / 'scripts'))
import build_app  # noqa: E402

FIELDS = ['name', 'formula', 'alt_formula', 'description', 'nuances', 'example', 'importance',
          'not_needed', 'synonyms', 'essence_note']
CYR = re.compile('[А-Яа-яЁё]')


def h(*parts):
    return hashlib.sha1('\x1f'.join(p or '' for p in parts).encode('utf-8')).hexdigest()[:12]


def podstavit(con):
    """Заменить русский текст копии Базы английским. Возвращает (ошибки, устаревшие)."""
    oshibki, ustarelo = [], []
    est = {r[0] for r in con.execute("select name from sqlite_master where type='table'")}
    if 'artifact_en' not in est:
        sys.exit('В Базе нет английского слоя: примените миграцию 023_map_library_en')

    # 1. Только видимые артефакты
    vidimye = {r[0] for r in con.execute('select artifact_id from artifact_en where visible = 1')}
    if not vidimye:
        sys.exit('Ни одного артефакта с visible = 1')
    q = ','.join('?' * len(vidimye))
    ubrat_mesta = [r[0] for r in con.execute(f'select id from metric_artifact where artifact_id not in ({q})', list(vidimye))]
    if ubrat_mesta:
        qm = ','.join('?' * len(ubrat_mesta))
        con.execute(f'delete from metric_metric where source_id in ({qm}) or target_id in ({qm})', ubrat_mesta * 2)
        con.execute(f'delete from metric_artifact where id in ({qm})', ubrat_mesta)
    con.execute(f'delete from artifact where id not in ({q})', list(vidimye))
    con.execute('delete from metric where id not in (select metric_id from metric_artifact)')
    for t in ('metric_dimension', 'question'):
        con.execute(f'delete from {t} where metric_id not in (select id from metric)')

    # 2. Артефакты, семьи, разрезы, группы и базовые вопросы
    for aid, name, access in con.execute('select artifact_id, name, access from artifact_en where visible = 1').fetchall():
        con.execute('update artifact set name = ?, access = coalesce(?, access), purpose = null where id = ?', (name, access, aid))
    con.execute('delete from family where id not in (select family_id from artifact where family_id is not null)')
    for key, name, blurb in con.execute('select family_key, name, blurb from family_en').fetchall():
        con.execute('update family set name = ?, blurb = ? where key = ?', (name, blurb, key))
    for did, name in con.execute('select dimension_id, name from dimension_en').fetchall():
        con.execute('update dimension set name = ?, description = null, variants = null, source = null where id = ?', (name, did))
    for gid, name, hint in con.execute('select group_id, name, hint from question_group_en').fetchall():
        con.execute('update question_group set name = ?, hint = ? where id = ?', (name, hint, gid))
    for qid, text in con.execute('select id, text from question_base_en').fetchall():
        con.execute('update question_base set text = ? where id = ?', (text, qid))

    # зоны на картах
    zony = {(r[0], r[1]): r[2] for r in con.execute('select artifact_id, ru, en from map_group_en')}
    for pid, aid, grp in con.execute('select id, artifact_id, "group" from metric_artifact').fetchall():
        if (grp or '').strip():
            if (aid, grp) not in zony:
                oshibki.append(f'зона «{grp}» на артефакте {aid}: нет перевода')
            else:
                con.execute('update metric_artifact set "group" = ? where id = ?', (zony[(aid, grp)], pid))

    # 3. Карточки метрик
    en = {r[0]: r for r in con.execute(f"select metric_id, {', '.join(FIELDS)}, src_hash from metric_en")}
    for m in con.execute(f"select id, {', '.join(FIELDS)} from metric").fetchall():
        mid, ru = m[0], m[1:]
        e = en.get(mid)
        if not e:
            oshibki.append(f'метрика {mid} «{ru[0]}»: нет перевода'); continue
        novoe = []
        for f, r_val, e_val in zip(FIELDS, ru, e[1:1 + len(FIELDS)]):
            if (r_val or '').strip() and not (e_val or '').strip() and f != 'synonyms':
                oshibki.append(f'метрика {mid} «{ru[0]}»: нет перевода поля {f}')
            novoe.append(e_val or None)
        if e[-1] and e[-1] != h(*ru) and e[-1] != h(ru[0]):
            ustarelo.append(f'метрика {mid} «{ru[0]}»')
        con.execute(f"update metric set {', '.join(f + ' = ?' for f in FIELDS)}, en = null where id = ?", novoe + [mid])
        # метка и вопрос места
    # (у деревьев у каждого места свой вопрос, у части — подпись; у карт они пустые)
    ma_en = ({(r[0], r[1]): (r[2], r[3]) for r in con.execute(
        'select metric_id, artifact_id, question, label_text from metric_artifact_en')}
        if 'metric_artifact_en' in est else {})
    for pid, mid, aid, label, question in con.execute(
            "select id, metric_id, artifact_id, label_text, question from metric_artifact").fetchall():
        if not ((label or '').strip() or (question or '').strip()):
            continue
        q_en, l_en = ma_en.get((mid, aid), (None, None))
        if ((question or '').strip() and not (q_en or '').strip()) or ((label or '').strip() and not (l_en or '').strip()):
            oshibki.append(f'место {pid}: у метки или вопроса места нет английского слоя')
            continue
        con.execute('update metric_artifact set question = ?, label_text = ? where id = ?', (q_en or None, l_en or None, pid))

    # 4. Заметки разрезов и вопросы
    md_en = {(r[0], r[1]): r[2] for r in con.execute('select metric_id, dimension_id, note from metric_dimension_en')}
    for mid, did, note in con.execute('select metric_id, dimension_id, note from metric_dimension').fetchall():
        if (mid, did) not in md_en and (note or '').strip():
            oshibki.append(f'метрика {mid}, разрез {did}: нет перевода заметки')
        con.execute('update metric_dimension set note = ? where metric_id = ? and dimension_id = ?', (md_en.get((mid, did)), mid, did))
    q_en = {r[0]: r[1] for r in con.execute('select question_id, text from question_en')}
    for qid, text in con.execute('select id, text from question').fetchall():
        if qid not in q_en:
            oshibki.append(f'вопрос {qid}: нет перевода'); continue
        con.execute('update question set text = ? where id = ?', (q_en[qid], qid))

    # 5. Ссылки на места, которых в английской версии нет, — просто текст
    uzly = {r[0] for r in con.execute('select node_id from metric_artifact')}
    def razvyazat(text):
        def zamena(mo):
            imya, uzel = mo.group(1), mo.group(2)
            return mo.group(0) if uzel in uzly else imya
        return re.sub(r'\[\[([^\]→]+)→([^\]]+)\]\]', zamena, text) if text else text
    for f in FIELDS:
        for mid, val in con.execute(f'select id, {f} from metric').fetchall():
            nov = razvyazat(val)
            if nov != val:
                con.execute(f'update metric set {f} = ? where id = ?', (nov, mid))
    return oshibki, ustarelo


def angliyskie_podpisi():
    """Подписи, которые сборщик пишет в выгрузку сам (не из Базы)."""
    build_app.LEGENDA = {"solid": "impact", "dashed": "link without impact (association)",
                         "green_+": "direct (up → up)", "red_-": "inverse (up → down)"}
    build_app.ROLI = {"action": "Action (controllable)", "result": "Result",
                      "diagnostic": "Diagnostic", "cost": "Cost"}
    build_app.PROVENANCE = "Map Library 2.0 — English version of the JetMetrics metrics atlas"
    build_app.ISTOCHNIK = "atlas.db + *_en"
    base_formula = build_app.formula_celikom
    def formula_celikom(osnovnaya, alternativa):
        return base_formula(osnovnaya, alternativa).replace('<br> ИЛИ<br> ', '<br> OR<br> ')
    build_app.formula_celikom = formula_celikom


def kirillica(put):
    """Где в выгрузке остался русский текст (кроме кодов)."""
    KODY = {'Количество', 'Деньги', 'Время', 'больше-лучше', 'меньше-лучше', 'баланс'}
    KLYUCHI = {k for k, _ in build_app.KARTOCHKA} | {'Формула', 'Разрезы'}
    naydeno = []
    def obhod(x, path):
        if isinstance(x, dict):
            for k, v in x.items():
                if CYR.search(str(k)) and k not in KLYUCHI:
                    naydeno.append(f'{path}: ключ {k}')
                obhod(v, f'{path}.{k}')
        elif isinstance(x, list):
            for i, v in enumerate(x):
                obhod(v, f'{path}[{i}]')
        elif isinstance(x, str) and CYR.search(x) and x not in KODY:
            naydeno.append(f'{path}: {x[:80]}')
    for f in sorted(pathlib.Path(put).glob('*.json')):
        obhod(json.load(open(f, encoding='utf-8')), f.name)
    return naydeno


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--db', default=str(KORNI / 'db' / 'atlas.db'))
    ap.add_argument('--out', default=str(KORNI / 'dist-en' / 'data'))
    a = ap.parse_args()
    with tempfile.TemporaryDirectory() as tmp:
        kopiya = pathlib.Path(tmp) / 'atlas_en.db'
        shutil.copy(a.db, kopiya)
        con = sqlite3.connect(kopiya)
        oshibki, ustarelo = podstavit(con)
        con.commit(); con.close()
        if oshibki:
            print(f'✗ {len(oshibki)} ошибок перевода, выгрузка не собрана:')
            for o in oshibki[:40]:
                print('  ', o)
            sys.exit(1)
        angliyskie_podpisi()
        build_app.sobrat(str(kopiya), a.out)
    if ustarelo:
        print(f'⚠ перевод устарел — русский текст менялся после перевода ({len(ustarelo)}):')
        for u in ustarelo[:20]:
            print('  ', u)
    ost = kirillica(a.out)
    print(f"{'✓' if not ost else '✗'} русского текста в выгрузке: {len(ost)}")
    for o in ost[:20]:
        print('  ', o)
    sys.exit(1 if ost else 0)


if __name__ == '__main__':
    main()
