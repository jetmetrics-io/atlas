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
const CONTENT_SRC = resolve(__dir, '../src/atlas/atlas_content.json')
const FIXES_SRC = resolve(__dir, '../src/atlas/fixes.json')
const OUT_DIR = resolve(__dir, '../public/data')

// Бесплатные карты (табло: деньги / спрос / забота о клиенте). Универсальны,
// но не операционные карты-рычаги — те платная ценность.
const FREE_SECTIONS = ['Финансы', 'Лидогенерация', 'Поддержка клиентов']

const base = JSON.parse(readFileSync(SRC, 'utf8'))

// Наши исправления к Базе (опечатки в названиях, непроставленные роли, неверные формулы).
// Саму Базу не правим: она пересобирается из Miro и правки бы затёрлись — поэтому они
// копятся здесь и накладываются при каждой сборке. Источник правды — content/fixes.json
// в воркспейсе Атласа, сюда файл копируется.
// ВАЖНО: до 21.08.2026 их применял только build.py (для рабочей таблицы контента), а
// приложение читало Базу напрямую — и 57 полей в бою оставались неисправленными.
const fixes = Object.fromEntries(
  Object.entries(JSON.parse(readFileSync(FIXES_SRC, 'utf8'))).filter(([k]) => !k.startsWith('_')),
)
let fixedNodes = 0
let fixedFields = 0
for (const n of base.nodes) {
  const fix = fixes[n.id]
  if (!fix) continue
  for (const [k, v] of Object.entries(fix)) {
    if (k.startsWith('_')) continue
    n[k] = v
    fixedFields++
  }
  fixedNodes++
}
const unknown = Object.keys(fixes).filter((id) => !base.nodes.some((n) => n.id === id))
if (unknown.length) {
  // битый id молча ничего не исправит — а мы будем думать, что правка applied
  console.warn(`gen-data: ⚠ правки на несуществующие метрики (${unknown.length}): ${unknown.join(', ')}`)
}
console.log(`gen-data: правок из fixes.json применено — ${fixedFields} полей у ${fixedNodes} метрик`)

// Контент карточек (шесть полей на метрику) — отдельными файлами, грузятся по требованию
// при открытии карточки, а не на старте: с ним общий файл вырос бы с 465 KB до ~2.5 MB
// и карта появлялась бы заметно позже. Ключ — тот же id, что у узла.
const content = JSON.parse(readFileSync(CONTENT_SRC, 'utf8'))

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

// Контент режется тем же гейтом, что и узлы: у бесплатного файла остаются
// только метрики бесплатных карт. Внутри карты контент не урезается.
const freeIds = new Set(nodes.map((n) => n.id))
const contentFree = Object.fromEntries(Object.entries(content).filter(([id]) => freeIds.has(id)))

mkdirSync(OUT_DIR, { recursive: true })
const write = (name, obj) => {
  const s = JSON.stringify(obj)
  writeFileSync(resolve(OUT_DIR, name), s)
  console.log(`gen-data: ${name} — ${obj.nodes.length} узлов, ${obj.edges.length} связей, ${(s.length / 1024).toFixed(0)} KB`)
}
write('atlas_full.json', full)
write('atlas_free.json', free)

const writeContent = (name, obj) => {
  const s = JSON.stringify(obj)
  writeFileSync(resolve(OUT_DIR, name), s)
  console.log(`gen-data: ${name} — ${Object.keys(obj).length} метрик, ${(s.length / 1024).toFixed(0)} KB`)
}
writeContent('content_full.json', content)
writeContent('content_free.json', contentFree)
