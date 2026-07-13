// Генератор данных сборки. Из полной Базы (atlas_base.json) делает файл,
// который реально попадает в бандл (atlas_data.json):
//   full — всё как есть.
//   free — метаданные ВСЕХ карт остаются (витрина показывает 28 карточек),
//          но узлы/связи закрытых карт ФИЗИЧЕСКИ вырезаны из бандла.
// Запуск: node scripts/gen-data.mjs <full|free>
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dir = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(__dir, '../src/atlas/atlas_base.json')
const OUT = resolve(__dir, '../src/atlas/atlas_data.json')

// Бесплатные карты (табло: деньги / спрос / забота о клиенте). Универсальны,
// но не операционные карты-рычаги — те платная ценность.
const FREE_SECTIONS = ['Финансы', 'Лидогенерация', 'Поддержка клиентов']

const tier = (process.argv[2] || 'full').toLowerCase()
if (tier !== 'full' && tier !== 'free') {
  console.error(`gen-data: неизвестный тир "${tier}" (ожидаю full|free)`)
  process.exit(1)
}

const base = JSON.parse(readFileSync(SRC, 'utf8'))

let out
if (tier === 'full') {
  out = { ...base, meta: { ...base.meta, tier: 'full' } }
} else {
  const keep = new Set(FREE_SECTIONS)
  const nodes = base.nodes.filter((n) => keep.has(n.section))
  const ids = new Set(nodes.map((n) => n.id))
  const edges = base.edges.filter((e) => ids.has(e.source) && ids.has(e.target))
  out = {
    ...base,
    meta: { ...base.meta, tier: 'free', freeSections: FREE_SECTIONS },
    sections: base.sections, // метаданные всех карт — витрина
    nodes,                    // только бесплатные — закрытых нет в бандле
    edges,
  }
}

writeFileSync(OUT, JSON.stringify(out))
const kb = (JSON.stringify(out).length / 1024).toFixed(0)
console.log(`gen-data: tier=${tier} → atlas_data.json (${out.nodes.length} узлов, ${out.edges.length} связей, ${kb} KB)`)
