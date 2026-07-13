// Загрузчик Базы + группировка карт по семействам + сборка одной карты
// (нормализация авторских координат под React Flow).
import raw from './atlas_base.json'
import type { AtlasBase, AtlasNode, AtlasEdge, Family } from './types'

export const BASE = raw as unknown as AtlasBase

const norm = (s: string) =>
  (s || '').replace(/​/g, '').replace(/\s+/g, ' ').trim().toLowerCase()

// ── Категории (8). Группировка по функции, выведена из фактических метрик карт.
// accent = имя бренд-цвета (см. tokens.css). ──
export const FAMILIES: Family[] = [
  {
    key: 'marketing', title: 'Маркетинг', accent: 'purple',
    blurb: 'Каналы привлечения: реклама, контент, поиск, email.',
    sections: ['контент-маркетинг', 'медийная реклама', 'поисковая реклама', 'seo',
      'e-mail маркетинг', 'работа с инфлюенсерами'],
  },
  {
    key: 'sales', title: 'Спрос и продажи', accent: 'blue',
    blurb: 'Как лиды и сделки превращаются в выручку.',
    sections: ['лидогенерация', 'b2b продажи', 'реферальная программа'],
  },
  {
    key: 'product', title: 'Продукт', accent: 'green',
    blurb: 'Активация, вовлечение и монетизация цифрового продукта.',
    sections: ['saas продукты', 'приложение', 'сайт', 'онлайн-обучение'],
  },
  {
    key: 'customers', title: 'Клиенты и удержание', accent: 'blue',
    blurb: 'База клиентов, повторные покупки, лояльность, поддержка.',
    sections: ['crm', 'программа лояльности', 'поддержка клиентов'],
  },
  {
    key: 'ops', title: 'Операции и логистика', accent: 'coral',
    blurb: 'Запасы, сборка, доставка, возвраты.',
    sections: ['управление запасами', 'обработка заказов', 'доставка заказов', 'возвраты товара'],
  },
  {
    key: 'finance', title: 'Финансы', accent: 'green',
    blurb: 'Экономика бизнеса: от выручки до чистой прибыли.',
    sections: ['финансы'],
  },
  {
    key: 'people', title: 'Люди', accent: 'coral',
    blurb: 'Найм, штат, текучесть, фонд оплаты труда.',
    sections: ['hr'],
  },
  {
    key: 'ecom', title: 'Электронная коммерция и ритейл', accent: 'yellow',
    blurb: 'Товарная торговля: ассортимент, маркетплейсы, заказы, магазин.',
    sections: ['ассортимент', 'маркетплейсы', 'ритейл', 'заказы',
      'воронка электронной коммерции', 'оформление заказа'],
  },
]

export function familyOf(sectionName: string): Family | undefined {
  const n = norm(sectionName)
  return FAMILIES.find((f) => f.sections.includes(n))
}

/** Карты семейства в порядке убывания числа метрик. */
export function sectionsOfFamily(fam: Family) {
  return BASE.sections
    .filter((s) => norm(s.name) !== '' && familyOf(s.name)?.key === fam.key)
    .sort((a, b) => b.nodes - a.nodes)
}

export interface MapView {
  section: string
  nodes: (AtlasNode & { px: number; py: number })[] // px,py — локальные координаты
  edges: AtlasEdge[]
  width: number
  height: number
}

// Целевой максимум пустого «коридора» между узлами (px). Полосы шире —
// ужимаются до цели; плотные места не трогаются, наложений не возникает.
const GAP_X = 82
const GAP_Y = 46

// Единая высота карточек. Атлас пришёл с разной высотой (1 строка ≈88, 2 строки ≈111);
// приводим все к одному габариту, сохраняя вертикальный ЦЕНТР каждой карточки (растём/
// сжимаемся симметрично) — тогда связи (привязка по центру грани) не смещаются, а раскладка
// остаётся без наложений. 96 = проверенный максимум без пересечений на всех 28 картах
// (см. тест в scratchpad); мета-полка + имя в 2 строки помещаются с запасом.
const UNIFORM_H = 96

/** Для набора интервалов [p, p+s] вернуть сдвиг влево/вверх каждого узла:
 *  пустые полосы (где нет ни одного узла) шире target ужимаются до target. */
function squeezeShifts(items: { p: number; s: number }[], target: number): number[] {
  const iv = items.map((it) => [it.p, it.p + it.s] as [number, number]).sort((a, b) => a[0] - b[0])
  const gaps: [number, number][] = []
  let cover = iv[0][1]
  for (let i = 1; i < iv.length; i++) {
    if (iv[i][0] > cover) gaps.push([cover, iv[i][0]])
    cover = Math.max(cover, iv[i][1])
  }
  return items.map((it) => {
    let shift = 0
    for (const [a, bnd] of gaps) if (bnd <= it.p) shift += Math.max(0, bnd - a - target)
    return shift
  })
}

/** Собрать одну карту: узлы секции + рёбра внутри секции, координаты нормализованы к (0,0). */
export function buildMap(sectionName: string): MapView {
  const nodes = BASE.nodes.filter((n) => n.section === sectionName)
  const ids = new Set(nodes.map((n) => n.id))
  const edges = BASE.edges.filter((e) => ids.has(e.source) && ids.has(e.target))
  const minX = Math.min(...nodes.map((n) => n.x))
  const minY = Math.min(...nodes.map((n) => n.y))
  const raw = nodes.map((n) => ({ ...n, px: n.x - minX, py: n.y - minY }))
  // Единая высота: сохраняем центр каждой карточки, затем нормализуем верх к 0.
  const centered = raw.map((n) => ({ ...n, py: n.py + n.h / 2 - UNIFORM_H / 2, h: UNIFORM_H }))
  const minPy = Math.min(...centered.map((n) => n.py))
  const base = centered.map((n) => ({ ...n, py: n.py - minPy }))
  // Убираем неоправданный воздух: ужимаем пустые коридоры по обеим осям.
  const dx = squeezeShifts(base.map((n) => ({ p: n.px, s: n.w })), GAP_X)
  const dy = squeezeShifts(base.map((n) => ({ p: n.py, s: n.h })), GAP_Y)
  const placed = base.map((n, i) => ({ ...n, px: n.px - dx[i], py: n.py - dy[i] }))
  const width = Math.max(...placed.map((n) => n.px + n.w))
  const height = Math.max(...placed.map((n) => n.py + n.h))
  return { section: sectionName, nodes: placed, edges, width, height }
}

export function nodeById(id: string) {
  return BASE.nodes.find((n) => n.id === id)
}
