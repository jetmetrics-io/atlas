// Загрузчик Базы + группировка карт по семействам + сборка одной карты
// (нормализация авторских координат под React Flow).
// ВАЖНО: импортируем atlas_data.json — генерируемый файл сборки (scripts/gen-data.mjs).
// В free-сборке из него физически вырезаны узлы/связи закрытых карт.
import raw from './atlas_data.json'
import type { AtlasBase, AtlasNode, AtlasEdge, Family } from './types'

export const BASE = raw as unknown as AtlasBase

// Тир сборки и список бесплатных карт (проставляются генератором в meta).
const _meta = BASE.meta as { tier?: string; freeSections?: string[] }
export const TIER: 'free' | 'full' = _meta.tier === 'free' ? 'free' : 'full'
const FREE_SET = new Set(_meta.freeSections ?? [])

/** Доступна ли карта в текущей сборке (в full — все; в free — только бесплатные). */
export function isSectionFree(name: string): boolean {
  return TIER === 'full' || FREE_SET.has(name)
}

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
  // pts — ломаная Miro, уложенная в текущую раскладку (координаты холста), концы
  // притянуты к граням карточек. Нет pts → рёбро рисуется пересчётным роутером.
  edges: (AtlasEdge & { pts?: [number, number][] })[]
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
const KEY_H = 118 // ключевая метрика выше обычной — приоритет (как крупная карточка в Miro)

/** Собрать одну карту: узлы секции + рёбра внутри секции, координаты нормализованы к (0,0). */
/** Пустые полосы [a,b] между интервалами (для позиционного сдвига точек рёбер). */
function gapsOf(items: { p: number; s: number }[]): [number, number][] {
  const iv = items.map((it) => [it.p, it.p + it.s] as [number, number]).sort((a, b) => a[0] - b[0])
  const gaps: [number, number][] = []
  let cover = iv[0][1]
  for (let i = 1; i < iv.length; i++) {
    if (iv[i][0] > cover) gaps.push([cover, iv[i][0]])
    cover = Math.max(cover, iv[i][1])
  }
  return gaps
}
/** Сдвиг координаты val тем же squeeze, что и узлы (сумма избытка полос ЛЕВЕЕ val). */
function shiftAt(val: number, gaps: [number, number][], target: number): number {
  let s = 0
  for (const [a, b] of gaps) if (b <= val) s += Math.max(0, (b - a) - target)
  return s
}
/**
 * То же для промежуточной точки РЕБРА: узлы всегда стоят на границах полос, а точка
 * ломаной может лежать ВНУТРИ сжимаемого коридора. shiftAt вычёл бы только полосы
 * целиком выше неё → точка сохраняла бы абсолютный отступ от верха коридора и после
 * сжатия «сползала» на грань соседней карточки. Здесь для содержащей полосы добавляем
 * ПРОПОРЦИОНАЛЬНУЮ долю избытка → точка остаётся на той же относительной высоте
 * коридора (напр. горизонтальный пробег коннектора — ровно по его середине).
 */
function shiftInterp(val: number, gaps: [number, number][], target: number): number {
  let s = 0
  for (const [a, b] of gaps) {
    if (b <= val) s += Math.max(0, (b - a) - target)
    else if (a < val && val < b) s += ((val - a) / (b - a)) * Math.max(0, (b - a) - target)
  }
  return s
}
// Часть коннекторов пришла из SVG со «шипами»: путь дёргается назад-вперёд у конца
// (артефакт извлечения — контрольная точка Безье торчит наружу). У ортогонального пути
// угол всегда 90° (dot=0) либо прямо (dot>0); РАЗВОРОТ (dot<0) — всегда шип. Итеративно
// выкидываем вершины-развороты (удаление одной может открыть следующую). Концы не трогаем.
function despike(pts: [number, number][]): [number, number][] {
  const q = pts.map((p) => [p[0], p[1]] as [number, number])
  let changed = true
  while (changed && q.length > 2) {
    changed = false
    for (let i = 1; i < q.length - 1; i++) {
      const d1x = q[i][0] - q[i - 1][0], d1y = q[i][1] - q[i - 1][1]
      const d2x = q[i + 1][0] - q[i][0], d2y = q[i + 1][1] - q[i][1]
      if (d1x * d2x + d1y * d2y < -1e-6) { q.splice(i, 1); changed = true; break }
    }
  }
  return q
}
// Скруглённый угол Miro экспортируется как короткая ДИАГОНАЛЬ-срез между двумя
// длинными ортогональными сегментами (напр. `[653,940]→[661,932]`). Разные срезы у
// соседних связей дают «разное скругление» в одном пучке. Схлопываем срез в чистый
// прямой угол (пересечение соседних прямых) → roundPoly скругляет одинаково.
const CORNER = 16
function decorner(pts: [number, number][]): [number, number][] {
  const q = pts.map((p) => [p[0], p[1]] as [number, number])
  for (let i = 1; i < q.length - 2; i++) {
    const dx = Math.abs(q[i + 1][0] - q[i][0]), dy = Math.abs(q[i + 1][1] - q[i][1])
    if (dx > 0.5 && dx < CORNER && dy > 0.5 && dy < CORNER) {
      const pv = Math.abs(q[i][0] - q[i - 1][0]) < Math.abs(q[i][1] - q[i - 1][1]) // сосед слева вертикальный?
      const nv = Math.abs(q[i + 2][0] - q[i + 1][0]) < Math.abs(q[i + 2][1] - q[i + 1][1])
      if (pv !== nv) { // настоящий угол (один сегмент вертикальный, другой горизонтальный)
        const cx = pv ? q[i][0] : q[i + 1][0]
        const cy = pv ? q[i + 1][1] : q[i][1]
        q[i] = [cx, cy]; q[i + 1] = [cx, cy]
      }
    }
  }
  return q
}
// Miro-коннекторы строго ортогональны; после remap+snap появляются микро-«диагонали»
// (≤TOL) от округления и центрирования uniform-H. Выпрямляем: почти-горизонтальный
// сегмент → общий Y, почти-вертикальный → общий X. Концы (0 и n-1, притянуты к граням)
// не двигаем — последний сегмент выпрямляем «назад», к целевому концу.
const ORTHO_TOL = 10
function ortho(pts: [number, number][]): [number, number][] {
  const q = pts.map((p) => [p[0], p[1]] as [number, number])
  for (let i = 0; i < q.length - 1; i++) {
    const dx = q[i + 1][0] - q[i][0], dy = q[i + 1][1] - q[i][1]
    const last = i + 1 === q.length - 1
    if (Math.abs(dy) <= Math.abs(dx) && Math.abs(dy) < ORTHO_TOL) {
      if (last) q[i][1] = q[i + 1][1]; else q[i + 1][1] = q[i][1]
    } else if (Math.abs(dx) < Math.abs(dy) && Math.abs(dx) < ORTHO_TOL) {
      if (last) q[i][0] = q[i + 1][0]; else q[i + 1][0] = q[i][0]
    }
  }
  return q
}
/** Убрать почти совпадающие подряд точки (нулевой сегмент схлопывает радиус скругления
 *  в 0 → острый угол) И коллинеарные промежуточные вершины (каждый прогон = один сегмент,
 *  иначе clearance-нудж двигает прогон по кускам и плодит микро-ступеньки). */
function simplify(pts: [number, number][], eps = 2): [number, number][] {
  const o: [number, number][] = [pts[0]]
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i], q = o[o.length - 1]
    if (Math.hypot(p[0] - q[0], p[1] - q[1]) >= eps) o.push(p)
  }
  if (o.length < 2) return [pts[0], pts[pts.length - 1]]
  const r: [number, number][] = [o[0]]
  for (let i = 1; i < o.length - 1; i++) {
    const a = r[r.length - 1], b = o[i], c = o[i + 1]
    const colX = Math.abs(a[0] - b[0]) < 1.5 && Math.abs(b[0] - c[0]) < 1.5
    const colY = Math.abs(a[1] - b[1]) < 1.5 && Math.abs(b[1] - c[1]) < 1.5
    if (colX || colY) continue // b лежит на прямой a→c — вершина лишняя
    r.push(b)
  }
  r.push(o[o.length - 1])
  return r
}
// Выровненная пара метрик → строго прямая связь, без S-ступеньки. Карточки в Miro бывают
// смещены на пару пикселей, связь цепляется к центрам граней → концы расходятся на ~малое
// смещение и путь делает микро-крюк. Если концы выровнены (по малой оси ≤ALIGN) и прямая
// по средней координате не задевает чужую карточку — заменяем всё ребро на прямую из 2 точек.
const ALIGN = 12
function straighten(
  pts: [number, number][],
  boxes: { id: string; px: number; py: number; w: number; h: number }[],
  srcId: string, tgtId: string,
): [number, number][] {
  const [x0, y0] = pts[0], [x1, y1] = pts[pts.length - 1]
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0)
  const clear = (a: [number, number], b: [number, number]): boolean => {
    for (const bx of boxes) {
      if (bx.id === srcId || bx.id === tgtId) continue
      const rx0 = bx.px + 4, ry0 = bx.py + 4, rx1 = bx.px + bx.w - 4, ry1 = bx.py + bx.h - 4
      if (Math.abs(a[0] - b[0]) < 1) { // вертикаль
        if (rx0 <= a[0] && a[0] <= rx1 && Math.min(a[1], b[1]) < ry1 && Math.max(a[1], b[1]) > ry0) return false
      } else { // горизонталь
        if (ry0 <= a[1] && a[1] <= ry1 && Math.min(a[0], b[0]) < rx1 && Math.max(a[0], b[0]) > rx0) return false
      }
    }
    return true
  }
  if (dy > dx && dx <= ALIGN) {
    const xm = (x0 + x1) / 2
    const s: [number, number] = [xm, y0], t: [number, number] = [xm, y1]
    if (clear(s, t)) return [s, t]
  }
  if (dx > dy && dy <= ALIGN) {
    const ym = (y0 + y1) / 2
    const s: [number, number] = [x0, ym], t: [number, number] = [x1, ym]
    if (clear(s, t)) return [s, t]
  }
  return pts
}

// Карточки в Miro расставлены руками: в одной колонке/ряду они смещены на пару пикселей,
// хотя должны стоять строго друг под другом / в линию. Подтягиваем «выбившиеся» к общей
// линии — цель кластера (координаты в пределах GRID_TOL) = МОДА (самое частое значение),
// поэтому большинство остаётся на месте, двигается только выбившаяся карточка. Если снап
// создаёт наложение — откатываем более сдвинутую карточку пары. Раскладку это только
// выпрямляет (сетка становится ровной), связи между выровненными метриками — прямыми.
const GRID_TOL = 16
function gridSnap<T extends { x: number; y: number; w: number; h: number }>(nodes: T[]): T[] {
  const out = nodes.map((n) => ({ ...n }))
  const orig = nodes.map((n) => ({ x: n.x, y: n.y }))
  // Снап по ЦЕНТРУ (для вертикали — по cy, не по верхней грани). Карточки разной высоты
  // (ключевая метрика в Miro выше) в одном ряду имеют равный центр, но разный y — снап по
  // грани сбивал бы центр вниз (Ритейл: Выручка оказывалась ниже Проданных единиц).
  const snapAxis = (val: (n: T) => number, set: (n: T, t: number) => void) => {
    const uniq = [...new Set(nodes.map(val))].sort((a, b) => a - b)
    const m = new Map<number, number>()
    let cur: number[] = [uniq[0]]
    const flush = () => {
      const counts = new Map<number, number>()
      for (const n of nodes) { const v = val(n); if (cur.includes(v)) counts.set(v, (counts.get(v) ?? 0) + 1) }
      const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1])
      let tgt: number
      if (sorted.length > 1 && sorted[0][1] === sorted[1][1]) {
        const vals = nodes.map(val).filter((v) => cur.includes(v)).sort((a, b) => a - b)
        tgt = vals[Math.floor(vals.length / 2)] // ничья мод → медиана
      } else tgt = sorted[0][0]
      for (const v of cur) m.set(v, tgt)
    }
    for (let i = 1; i < uniq.length; i++) {
      if (uniq[i] - cur[cur.length - 1] <= GRID_TOL) cur.push(uniq[i])
      else { flush(); cur = [uniq[i]] }
    }
    flush()
    for (const n of out) { const t = m.get(val(n)); if (t !== undefined) set(n, t) }
  }
  snapAxis((n) => n.x, (n, t) => { n.x = t })
  snapAxis((n) => n.y + n.h / 2, (n, t) => { n.y = t - n.h / 2 })
  // Проверяем наложения по ЭФФЕКТИВНОЙ карточке: buildMap дальше приведёт все к UNIFORM_H
  // (с сохранением центра), поэтому гард обязан считать высоту 96 — иначе пропустит пару,
  // которая сомкнётся уже после уравнивания высот (напр. DAU/MAU в SaaS).
  const overlap = (a: T, b: T) => {
    const ay = a.y + a.h / 2 - UNIFORM_H / 2, by = b.y + b.h / 2 - UNIFORM_H / 2
    return a.x < b.x + b.w - 2 && a.x + a.w > b.x + 2 && ay < by + UNIFORM_H - 2 && ay + UNIFORM_H > by + 2
  }
  for (let iter = 0; iter < 20; iter++) {
    let any = false
    for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) {
      if (overlap(out[i], out[j])) {
        const di = Math.abs(out[i].x - orig[i].x) + Math.abs(out[i].y - orig[i].y)
        const dj = Math.abs(out[j].x - orig[j].x) + Math.abs(out[j].y - orig[j].y)
        const k = di >= dj ? i : j
        if (out[k].x !== orig[k].x || out[k].y !== orig[k].y) { out[k].x = orig[k].x; out[k].y = orig[k].y; any = true }
      }
    }
    if (!any) break
  }
  return out
}

export function buildMap(sectionName: string): MapView {
  const nodes = gridSnap(BASE.nodes.filter((n) => n.section === sectionName))
  const ids = new Set(nodes.map((n) => n.id))
  const edges = BASE.edges.filter((e) => ids.has(e.source) && ids.has(e.target))
  const minX = Math.min(...nodes.map((n) => n.x))
  const minY = Math.min(...nodes.map((n) => n.y))
  const raw = nodes.map((n) => ({ ...n, px: n.x - minX, py: n.y - minY }))
  // Единая высота, СОХРАНЯЯ ЦЕНТР. Ключевая метрика — выше (KEY_H): в Miro она крупнее
  // (Выручка h≈120 против 88), это её визуальный приоритет. Центр сохраняем → связи на
  // уровне центра (гориз.) не ломаются, а верх ключевой карточки выступает вверх.
  const hOf = (n: { key?: boolean }) => (n.key ? KEY_H : UNIFORM_H)
  const centered = raw.map((n) => ({ ...n, py: n.py + n.h / 2 - hOf(n) / 2, h: hOf(n) }))
  const minPy = Math.min(...centered.map((n) => n.py))
  const base = centered.map((n) => ({ ...n, py: n.py - minPy }))
  // Убираем неоправданный воздух: ужимаем пустые коридоры по обеим осям.
  const gx = gapsOf(base.map((n) => ({ p: n.px, s: n.w })))
  const gy = gapsOf(base.map((n) => ({ p: n.py, s: n.h })))
  const placed = base.map((n) => ({
    ...n,
    px: n.px - shiftAt(n.px, gx, GAP_X),
    py: n.py - shiftAt(n.py, gy, GAP_Y),
  }))
  const width = Math.max(...placed.map((n) => n.px + n.w))
  const height = Math.max(...placed.map((n) => n.py + n.h))

  // Геометрия связей из Miro, уложенная в ЭТУ раскладку: те же позиционные сдвиги, что
  // у узлов (squeeze), затем концы притягиваем к грани своей карточки. Так связь идёт
  // ровно как в оригинале, а раскладку (позиции/squeeze/uniform-H) мы не трогаем.
  const boxOf = new Map(placed.map((n) => [n.id, n]))
  // Точка исходных координат Miro → координаты холста (translate + squeeze).
  const remap = (x: number, y: number): [number, number] => {
    const px = x - minX
    const py = (y - minY) - minPy // uniform-H центрирование для средних точек опускаем (~≤7px), концы притянем
    // shiftInterp (не shiftAt): точку ВНУТРИ сжимаемого коридора центрируем пропорционально,
    // иначе горизонтальный/вертикальный пробег коннектора съезжает на грань карточки.
    return [px - shiftInterp(px, gx, GAP_X), py - shiftInterp(py, gy, GAP_Y)]
  }
  // Притянуть конец связи к ближайшей грани карточки (сторона — по направлению из центра).
  const snap = (pt: [number, number], id: string): [number, number] => {
    const b = boxOf.get(id)
    if (!b) return pt
    const [x, y] = pt
    const cx = b.px + b.w / 2, cy = b.py + b.h / 2
    const dx = x - cx, dy = y - cy
    const M = 8
    if (Math.abs(dx) / (b.w / 2) >= Math.abs(dy) / (b.h / 2)) {
      return [dx > 0 ? b.px + b.w : b.px, Math.min(Math.max(y, b.py + M), b.py + b.h - M)]
    }
    return [Math.min(Math.max(x, b.px + M), b.px + b.w - M), dy > 0 ? b.py + b.h : b.py]
  }
  // Минимальный зазор прогона от грани карточки, вдоль которой он идёт: сжатие коридора
  // может подтянуть горизонтальный/вертикальный пробег вплотную к соседней карточке
  // (читается как «примыкает»). Двигаем ТОЛЬКО прогоны, что «липнут» (<CLR), на минимум;
  // прогоны с воздухом не трогаем. Сдвиг зажат углами-соседями → вертикали не переворачиваются.
  const CLR = 34
  const boxes = placed
  const nudge = (pts: [number, number][]): [number, number][] => {
    const q = pts.map((p) => [p[0], p[1]] as [number, number])
    for (let i = 1; i < q.length - 2; i++) {
      const [x0, y0] = q[i], [x1, y1] = q[i + 1]
      if (Math.abs(y0 - y1) < 1 && Math.abs(x0 - x1) >= 1) {
        const Y = y0, xa = Math.min(x0, x1), xb = Math.max(x0, x1)
        const ov = boxes.filter((b) => b.px < xb - 2 && b.px + b.w > xa + 2)
        const ab = ov.filter((b) => b.py + b.h <= Y + 1).map((b) => b.py + b.h)
        const be = ov.filter((b) => b.py >= Y - 1).map((b) => b.py)
        const aY = ab.length ? Math.max(...ab) : null
        const bY = be.length ? Math.min(...be) : null
        let nY = Y
        if (aY !== null && Y - aY < CLR) nY = aY + CLR
        if (bY !== null && bY - nY < CLR) nY = Math.min(nY, bY - CLR)
        if (aY !== null && (bY === null || bY - (aY + CLR) >= -0.1)) nY = Math.max(nY, aY + CLR)
        // Кламп углами-соседями. НО если сосед — притянутый КОНЕЦ на грани карточки
        // (i-1==0 / i+2==last), не тянем прогон на его грань: берём исходный Y прогона как
        // границу. Иначе ⊓-коридор над карточками схлопывается на верх/низ целевой карточки
        // (связь скользит вдоль грани, а не входит перпендикуляром).
        const n1y = i - 1 === 0 ? Y : q[i - 1][1]
        const n2y = i + 2 === q.length - 1 ? Y : q[i + 2][1]
        const lo = Math.min(n1y, n2y), hi = Math.max(n1y, n2y)
        nY = Math.min(Math.max(nY, lo), hi)
        q[i][1] = nY; q[i + 1][1] = nY
      } else if (Math.abs(x0 - x1) < 1 && Math.abs(y0 - y1) >= 1) {
        const X = x0, ya = Math.min(y0, y1), yb = Math.max(y0, y1)
        const ov = boxes.filter((b) => b.py < yb - 2 && b.py + b.h > ya + 2)
        const lf = ov.filter((b) => b.px + b.w <= X + 1).map((b) => b.px + b.w)
        const rt = ov.filter((b) => b.px >= X - 1).map((b) => b.px)
        const lX = lf.length ? Math.max(...lf) : null
        const rX = rt.length ? Math.min(...rt) : null
        let nX = X
        if (lX !== null && X - lX < CLR) nX = lX + CLR
        if (rX !== null && rX - nX < CLR) nX = Math.min(nX, rX - CLR)
        if (lX !== null && (rX === null || rX - (lX + CLR) >= -0.1)) nX = Math.max(nX, lX + CLR)
        // См. коммент в горизонтальной ветке: конец на грани не тянет прогон на свою грань.
        const n1x = i - 1 === 0 ? X : q[i - 1][0]
        const n2x = i + 2 === q.length - 1 ? X : q[i + 2][0]
        const lo = Math.min(n1x, n2x), hi = Math.max(n1x, n2x)
        nX = Math.min(Math.max(nX, lo), hi)
        q[i][0] = nX; q[i + 1][0] = nX
      }
    }
    return q
  }
  const placedEdges = edges.map((e) => {
    const src = e.points
    if (!src || src.length < 2) return e
    let pts = src.map(([x, y]) => remap(x, y)) as [number, number][]
    pts[0] = snap(pts[0], e.source)
    pts[pts.length - 1] = snap(pts[pts.length - 1], e.target)
    // despike → углы-срезы → выпрямить → убрать дубли/коллинеарные → отвести от граней →
    // финальный simplify (nudge мог создать дубли/коллинеарные точки) → выровненные пары в прямую.
    pts = simplify(nudge(simplify(ortho(decorner(despike(pts))))))
    pts = straighten(pts, placed, e.source, e.target)
    return { ...e, pts }
  })

  // Пучок связей, входящих в ОДНУ точку грани карточки, но с коридорами в пару px друг
  // от друга (шум исходника Miro), даёт «двоение» линии — напр. Отзывов/Ср.рейтинг/
  // Вовлечённость → верх «Количества проданных»: коридоры 415 и 417. Сливаем: коридор
  // перед перпендикулярным сбросом в грань сажаем на общую координату (медиану пучка),
  // если разброс ≤BAND (иначе это разные маршруты — не трогаем).
  const BAND = 12
  type PE = { target: string; pts?: [number, number][] }
  const bundles = new Map<string, { e: PE; vert: boolean }[]>()
  for (const e of placedEdges as unknown as PE[]) {
    if (!e.pts || e.pts.length < 3) continue
    const n = e.pts.length, E = e.pts[n - 1], A = e.pts[n - 2]
    const vert = Math.abs(E[0] - A[0]) <= Math.abs(E[1] - A[1]) // сброс вертикальный → коридор горизонтальный
    const key = `${e.target}|${Math.round(E[0] / 8)},${Math.round(E[1] / 8)}|${vert ? 'v' : 'h'}`
    const arr = bundles.get(key) ?? []
    arr.push({ e, vert }); bundles.set(key, arr)
  }
  for (const arr of bundles.values()) {
    if (arr.length < 2) continue
    const vert = arr[0].vert
    const coordOf = (it: { e: PE }) => { const p = it.e.pts!; const A = p[p.length - 2]; return vert ? A[1] : A[0] }
    const vals = arr.map(coordOf).sort((a, b) => a - b)
    if (vals[vals.length - 1] - vals[0] > BAND) continue // не пучок
    const med = vals[Math.floor(vals.length / 2)]
    for (const { e } of arr) {
      const p = e.pts!, n = p.length, ax = vert ? 1 : 0
      const c0 = p[n - 2][ax]
      for (let i = n - 2; i >= 0 && Math.abs(p[i][ax] - c0) < 1; i--) p[i][ax] = med // весь коридор на медиану
    }
  }

  // Стыки-стубы ДВУХ НЕСВЯЗАННЫХ связей (нет общего узла), слипшиеся на одной оси —
  // напр. Ритейл: «Средний чек→Выручка» выходит из верха Ср.чека по центру (x=1813), а
  // «…в чеке→Проданные единицы» входит в низ Проданных там же (Ср.чек и Проданные строго
  // друг под другом) → линии соприкасаются. Двигаем КОРОТКИЙ стуб (он лишь примыкает)
  // вдоль грани своей карточки, к своему повороту, на PORT_GAP. Фаны/пучки (общий узел)
  // НЕ трогаем. По всем 28 картам таких коллизий ровно 2 (обе — этот случай).
  const PORT_GAP = 30, M2 = 10
  const geom = (e: { source: string; target: string; pts?: [number, number][] }, first: boolean) => {
    const p = e.pts!, n = p.length
    const i = first ? 0 : n - 1, j = first ? 1 : n - 2, k = first ? 2 : n - 3
    const A = p[i], B = p[j], horiz = Math.abs(A[1] - B[1]) < Math.abs(A[0] - B[0])
    return {
      A, B, horiz, lane: horiz ? A[1] : A[0],
      a: Math.min(A[horiz ? 0 : 1], B[horiz ? 0 : 1]), b: Math.max(A[horiz ? 0 : 1], B[horiz ? 0 : 1]),
      len: Math.hypot(A[0] - B[0], A[1] - B[1]), node: boxOf.get(first ? e.source : e.target),
      turn: k >= 0 && k < n ? p[k] : B,
    }
  }
  type EE = { source: string; target: string; pts?: [number, number][] }
  const stubs = (placedEdges as unknown as EE[]).flatMap((e) => e.pts && e.pts.length >= 2 ? [{ e, first: true }, { e, first: false }] : [])
  for (let x = 0; x < stubs.length; x++) for (let y = x + 1; y < stubs.length; y++) {
    const sa = stubs[x], sb = stubs[y]
    if (sa.e === sb.e) continue
    const A = sa.e, B = sb.e
    if (A.source === B.source || A.source === B.target || A.target === B.source || A.target === B.target) continue
    const ga = geom(sa.e, sa.first), gb = geom(sb.e, sb.first)
    if (ga.horiz !== gb.horiz || Math.abs(ga.lane - gb.lane) >= 6) continue
    if (Math.min(ga.b, gb.b) - Math.max(ga.a, gb.a) <= 6) continue
    const mv = ga.len <= gb.len ? ga : gb, other = mv === ga ? gb : ga
    const ax = mv.horiz ? 1 : 0 // ось смещения: верт. стуб двигаем по X, гориз. по Y
    const dir = Math.sign((mv.turn[ax] - mv.A[ax]) || 1)
    let nl = other.lane + dir * PORT_GAP
    if (mv.node) {
      const lo = (ax === 0 ? mv.node.px : mv.node.py) + M2
      const hi = (ax === 0 ? mv.node.px + mv.node.w : mv.node.py + mv.node.h) - M2
      nl = Math.min(Math.max(nl, lo), hi)
    }
    mv.A[ax] = nl; mv.B[ax] = nl
  }

  return { section: sectionName, nodes: placed, edges: placedEdges, width, height }
}

export function nodeById(id: string) {
  return BASE.nodes.find((n) => n.id === id)
}
