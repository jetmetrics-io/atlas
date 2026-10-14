#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Миграция 023 — английский слой: Map Library 2.0, английская версия Атласа.

    python3 023_map_library_en.py <путь к atlas.db> [--check]

Решение Марии 08.10.2026 (jetmetrics.io, README «Map Library 2.0: хранение, порядок, что скрыто»):
английский текст живёт в той же Базе, отдельными таблицами рядом с русскими, ключ — номер метрики
(и разреза, вопроса, артефакта). Русские таблицы не трогаются: русская выгрузка остаётся прежней.
Английскую собирает `scripts/build_en.py`.

Таблицы (по одной на каждую русскую с текстом):
    metric_en            (metric_id)        name, formula, alt_formula, description, nuances, example,
                                            importance, not_needed, synonyms, essence_note
    dimension_en         (dimension_id)     name
    metric_dimension_en  (metric_id, dimension_id)  note
    question_en          (question_id)      text
    artifact_en          (artifact_id)      name, visible (есть ли в английской версии), access
    family_en            (family_key)       name, blurb
    question_group_en    (group_id)         name, hint
    question_base_en     (id)               text
    map_group_en         (artifact_id, ru)  en — зоны на карте (metric_artifact."group")
    metric_artifact_en   (metric_id, artifact_id)  question, label_text — вопрос и подпись места (у деревьев)
У строки — src_hash: отпечаток русского текста, с которого переводили. Русское поменялось —
сборка английской версии называет такие строки устаревшими.

Данные — `023_map_library_en.json` рядом: полный снимок английского слоя, собирает `map_library_2/to_db_json.py`
в репо `jetmetrics-io/site-en`. Обновление английских текстов — новый снимок в тот же файл, повторный запуск
этой миграции (она пересоздаёт таблицы `*_en`), `npm run db:dump`, коммит.
Миграция заменяет английский слой целиком: повторный запуск с тем же JSON ничего не меняет.
"""
import json, pathlib, shutil, sqlite3, sys, datetime

HERE = pathlib.Path(__file__).resolve().parent
DATA = HERE / '023_map_library_en.json'

SCHEMA = """
create table if not exists metric_en (
  metric_id integer primary key references metric(id) on delete cascade,
  name text not null, formula text, alt_formula text, description text, nuances text, example text,
  importance text, not_needed text, synonyms text, essence_note text, src_hash text);
create table if not exists dimension_en (
  dimension_id integer primary key references dimension(id) on delete cascade,
  name text not null, src_hash text);
create table if not exists metric_dimension_en (
  metric_id integer not null, dimension_id integer not null, note text, src_hash text,
  primary key (metric_id, dimension_id));
create table if not exists question_en (
  question_id integer primary key references question(id) on delete cascade,
  text text not null, src_hash text);
create table if not exists artifact_en (
  artifact_id integer primary key references artifact(id) on delete cascade,
  name text not null, visible integer not null default 0, access text check (access in ('free','paid')),
  src_hash text);
create table if not exists family_en (family_key text primary key, name text not null, blurb text);
create table if not exists question_group_en (group_id text primary key, name text not null, hint text);
create table if not exists question_base_en (id integer primary key, text text not null);
create table if not exists map_group_en (artifact_id integer not null, ru text not null, en text not null, primary key (artifact_id, ru));
create table if not exists metric_artifact_en (
  metric_id integer not null, artifact_id integer not null, question text, label_text text, src_hash text,
  primary key (metric_id, artifact_id));
"""
TABLES = ['metric_en', 'dimension_en', 'metric_dimension_en', 'question_en', 'artifact_en',
          'family_en', 'question_group_en', 'question_base_en', 'map_group_en', 'metric_artifact_en']
MCOLS = ['name', 'formula', 'alt_formula', 'description', 'nuances', 'example', 'importance',
         'not_needed', 'synonyms', 'essence_note', 'src_hash']


def primenit(con, d):
    con.executescript(SCHEMA)
    for t in TABLES:
        con.execute(f'delete from {t}')
    for mid, m in d['metric'].items():
        con.execute(f"insert into metric_en (metric_id, {', '.join(MCOLS)}) values (?{', ?' * len(MCOLS)})",
                    [int(mid)] + [m.get(c) or None for c in MCOLS])
    for i, x in d['dimension'].items():
        con.execute('insert into dimension_en values (?, ?, ?)', (int(i), x['name'], x.get('src_hash')))
    for x in d['metric_dimension']:
        con.execute('insert into metric_dimension_en values (?, ?, ?, ?)',
                    (x['metric_id'], x['dimension_id'], x['note'], x.get('src_hash')))
    for i, x in d['question'].items():
        con.execute('insert into question_en values (?, ?, ?)', (int(i), x['text'], x.get('src_hash')))
    for i, x in d['artifact'].items():
        con.execute('insert into artifact_en values (?, ?, ?, ?, ?)',
                    (int(i), x['name'], x['visible'], x.get('access'), x.get('src_hash')))
    for k, x in d['family'].items():
        con.execute('insert into family_en values (?, ?, ?)', (k, x['name'], x.get('blurb')))
    for k, x in d['question_group'].items():
        con.execute('insert into question_group_en values (?, ?, ?)', (k, x['name'], x.get('hint')))
    for i, x in d['question_base'].items():
        con.execute('insert into question_base_en values (?, ?)', (int(i), x['text']))
    for x in d.get('map_group', []):
        con.execute('insert into map_group_en values (?, ?, ?)', (x['artifact_id'], x['ru'], x['en']))
    for x in d.get('metric_artifact', []):
        con.execute('insert into metric_artifact_en values (?, ?, ?, ?, ?)',
                    (x['metric_id'], x['artifact_id'], x.get('question') or None, x.get('label_text') or None, x.get('src_hash')))


def proverit(con, d):
    oshibki = []
    n = {t: con.execute(f'select count(*) from {t}').fetchone()[0] for t in TABLES}
    if n['metric_en'] != len(d['metric']): oshibki.append(f"metric_en {n['metric_en']} ≠ {len(d['metric'])}")
    if n['question_en'] != len(d['question']): oshibki.append(f"question_en {n['question_en']} ≠ {len(d['question'])}")
    lishnie = con.execute('select count(*) from metric_en where metric_id not in (select id from metric)').fetchone()[0]
    if lishnie: oshibki.append(f'metric_en: {lishnie} строк без русской метрики')
    lishnie = con.execute('select count(*) from question_en where question_id not in (select id from question)').fetchone()[0]
    if lishnie: oshibki.append(f'question_en: {lishnie} строк без русского вопроса')
    return oshibki, n


def main():
    db = pathlib.Path(sys.argv[1])
    d = json.load(open(DATA, encoding='utf-8'))
    con = sqlite3.connect(db)
    if '--check' not in sys.argv:
        shutil.copy(db, db.with_name(f"{db.stem}.before_023_{datetime.datetime.now():%Y%m%d_%H%M%S}.db"))
        with con:
            primenit(con, d)
    oshibki, n = proverit(con, d)
    print('✓' if not oshibki else '✗', ' · '.join(f'{t} {k}' for t, k in n.items()))
    for o in oshibki:
        print('  ', o)
    sys.exit(1 if oshibki else 0)


if __name__ == '__main__':
    main()
