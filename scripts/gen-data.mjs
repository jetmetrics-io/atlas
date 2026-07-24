// Генератор данных Атласа. Из полной Базы (atlas_base.json) делает ДВА рантайм-файла
// в public/data/ (Vite копирует public/ в корень dist → грузятся с бакета по fetch):
//   atlas_full.json — всё как есть (28 карт). Грузится только оплатившим.
//   atlas_free.json — метаданные ВСЕХ карт (витрина показывает 28 карточек), но узлы/
//                     связи закрытых карт ВЫРЕЗАНЫ. Грузится бесплатнику/анониму.
// Оба несут meta.freeSections — приложение знает, какие карты бесплатны, из любого файла.
// Сборка ОДНА; что грузить — решает main.tsx по факту оплаты (см. src/site/access.ts).
// Запуск: node scripts/gen-data.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dir = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(__dir, '../src/atlas/atlas_base.json')
const OUT_DIR = resolve(__dir, '../public/data')

// Бесплатные карты (табло: деньги / спрос / забота о клиенте). Универсальны,
// но не операционные карты-рычаги — те платная ценность.
const FREE_SECTIONS = ['Финансы', 'Лидогенерация', 'Поддержка клиентов']

const base = JSON.parse(readFileSync(SRC, 'utf8'))

// full — всё как есть, но с проставленным freeSections (для витрины/бейджей у оплатившего).
const full = { ...base, meta: { ...base.meta, freeSections: FREE_SECTIONS } }

// free — метаданные всех карт остаются, узлы/связи закрытых физически вырезаны.
const keep = new Set(FREE_SECTIONS)
const nodes = base.nodes.filter((n) => keep.has(n.section))
const ids = new Set(nodes.map((n) => n.id))
const edges = base.edges.filter((e) => ids.has(e.source) && ids.has(e.target))
const free = {
  ...base,
  meta: { ...base.meta, freeSections: FREE_SECTIONS },
  sections: base.sections, // метаданные всех 28 карт — витрина
  nodes,                    // только бесплатные
  edges,
}

mkdirSync(OUT_DIR, { recursive: true })
const write = (name, obj) => {
  const s = JSON.stringify(obj)
  writeFileSync(resolve(OUT_DIR, name), s)
  console.log(`gen-data: ${name} — ${obj.nodes.length} узлов, ${obj.edges.length} связей, ${(s.length / 1024).toFixed(0)} KB`)
}
write('atlas_full.json', full)
write('atlas_free.json', free)
