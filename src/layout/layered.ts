import type { GeneratedView } from '../engine/generate'
import type { ViewMode } from '../engine/generate'
import { NODE_H, NODE_W } from '../flow/tokens'

export interface Positioned {
  id: string
  x: number
  y: number
}

const COL_GAP = 150 // гориз. зазор колонок (дерево)
const ROW_GAP_V = 80 // верт. зазор рядов (карта)
const SIB_GAP = 40 // зазор соседей в ряду (карта)
const STACK_GAP = 26 // зазор в стопке (дерево)

function group(view: GeneratedView): Map<number, string[]> {
  const m = new Map<number, string[]>()
  for (const n of view.nodes) {
    if (!m.has(n.layer)) m.set(n.layer, [])
    m.get(n.layer)!.push(n.id)
  }
  return m
}

// ДЕРЕВО: горизонтальное, корень (фокус, layer 0) слева, драйверы (layer<0) вправо.
function layoutTree(view: GeneratedView): Map<string, Positioned> {
  const byLayer = group(view)
  const colStep = NODE_W + COL_GAP
  const rowStep = NODE_H + STACK_GAP
  const maxCount = Math.max(...[...byLayer.values()].map((v) => v.length), 1)
  const fullH = maxCount * rowStep
  const pos = new Map<string, Positioned>()
  for (const [layer, ids] of byLayer) {
    const x = -layer * colStep // layer 0 → 0 (слева), -1 → colStep, ...
    const top = (fullH - ids.length * rowStep) / 2
    ids.forEach((id, i) => pos.set(id, { id, x, y: top + i * rowStep }))
  }
  return pos
}

// КАРТА: ярусы детализации сверху вниз (layer=tier: 1 табло сверху → 3 рычаги снизу).
// Каждый ярус переносится в СЕТКУ-блок (иначе один ярус вытягивается в ленту из десятков карточек).
// Блоки центрируются по общей ширине → узел не «прыгает» вбок при смене уровня детализации.
function layoutMap(view: GeneratedView): Map<string, Positioned> {
  const byLayer = group(view)
  const colStep = NODE_W + SIB_GAP
  const gridRowStep = NODE_H + 34 // компактный ряд внутри блока яруса
  const bandGap = ROW_GAP_V // зазор между ярусами
  const layers = [...byLayer.keys()].sort((a, b) => a - b) // 1,2,3 сверху вниз
  const maxCount = Math.max(...[...byLayer.values()].map((v) => v.length), 1)
  // ширина сетки ≈ квадрат по самому большому ярусу (аккуратное полотно, а не лента)
  const cols = Math.max(1, Math.ceil(Math.sqrt(maxCount)))
  const fullW = cols * colStep
  const pos = new Map<string, Positioned>()
  let yCursor = 0
  for (const layer of layers) {
    const ids = byLayer.get(layer)!
    const rows = Math.ceil(ids.length / cols)
    ids.forEach((id, i) => {
      const r = Math.floor(i / cols)
      const c = i % cols
      const rowCount = r === rows - 1 ? ids.length - r * cols : cols // центрируем неполный последний ряд
      const left = (fullW - rowCount * colStep) / 2
      pos.set(id, { id, x: left + c * colStep, y: yCursor + r * gridRowStep })
    })
    yCursor += rows * gridRowStep + bandGap
  }
  return pos
}

export function layout(view: GeneratedView, mode: ViewMode): Map<string, Positioned> {
  return mode === 'tree' ? layoutTree(view) : layoutMap(view)
}
