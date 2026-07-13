import type { ContextRole, Controllability, EdgeKind, GraphEdge, MapTier } from '../graph/types'
import { GRAPH, getNode, inEdges, nodeDegree, nodeTier, outEdges } from '../graph/load'

export type ViewMode = 'map' | 'tree'
export type TreeDir = 'drivers' | 'outcomes'
export type Volume = 'S' | 'M' | 'L'
export type Strength = 'weak' | 'medium' | 'strong'
export type DetailLevel = MapTier // 1 обзор / 2 детали / 3 всё

// ОБЪЕКТИВ (линза): одна модальность связи за раз → когерентный, неперегруженный вид.
// formula = тождества (из чего складывается, арифметика верна всегда),
// causal = влияния (что двигает + flip, гипотеза не на данных), diagnostic = ассоциации (предикторы, крутить нельзя).
export type Lens = 'formula' | 'causal' | 'diagnostic'
const LENS_KIND: Record<Lens, EdgeKind> = { formula: 'identity', causal: 'influence', diagnostic: 'associative' }

export interface GenOptions {
  mode: ViewMode
  treeDir: TreeDir
  volume: Volume
  lens: Lens
  minStrength: Strength // скрывать влияния слабее порога
  showDraft: boolean // показывать ли черновой слой (provenance: draft)
  expanded: Set<string> // узлы, ветки которых раскрыты вручную
}

export interface ViewNode {
  id: string
  layer: number // 0 фокус, <0 драйверы, >0 исходы
  role: ContextRole
  hiddenIn: number // сколько драйверов скрыто (для бейджа)
  hiddenOut: number // сколько исходов скрыто
}

export interface ViewEdge {
  id: string
  source: string
  target: string
  kind: EdgeKind
  sign: GraphEdge['sign']
  op?: GraphEdge['op']
  strength: GraphEdge['strength']
  provenance: GraphEdge['provenance']
  confidence: GraphEdge['confidence']
}

export interface GeneratedView {
  nodes: ViewNode[]
  edges: ViewEdge[]
  focusId: string
}

const VOL: Record<Volume, { depth: number; cap: number }> = {
  S: { depth: 1, cap: 4 },
  M: { depth: 2, cap: 5 },
  L: { depth: 3, cap: 7 },
}
const SORDER: Record<Strength, number> = { weak: 0, medium: 1, strong: 2 }

// В линзе видна только её модальность. Влияния дополнительно режутся по силе.
function edgePasses(e: GraphEdge, f: Pick<GenOptions, 'lens' | 'minStrength' | 'showDraft'>): boolean {
  if (e.provenance === 'draft' && !f.showDraft) return false
  if (e.kind !== LENS_KIND[f.lens]) return false
  if (e.kind === 'influence' && SORDER[e.strength] < SORDER[f.minStrength]) return false
  return true
}

// На КАРТЕ цвет узла кодирует УПРАВЛЯЕМОСТЬ (JTBD: главный сигнал), а не роль-от-фокуса:
// рычаг → синий (driver), результат → фиолетовый (outcome), полу-рычаг → зелёный (focus).
const CTRL_ROLE: Record<Controllability, ContextRole> = { lever: 'driver', result: 'outcome', semi: 'focus' }

/**
 * КАРТА как цельное полотно с ярусами (LOD). НЕ окрестность-вокруг-фокуса.
 * Показываем все узлы с tier ≤ level; ярус кладём в layer (1 сверху, 3 снизу).
 * Позиции считаются раскладкой по ПОЛНОМУ набору (level=3) → при смене уровня узлы не двигаются.
 */
export function buildMapView(level: DetailLevel, opts: Pick<GenOptions, 'lens' | 'minStrength' | 'showDraft'>): GeneratedView {
  const fo = opts
  const kept = new Set<string>()
  for (const n of GRAPH.nodes) if (nodeTier(n.id) <= level) kept.add(n.id)

  const edges: ViewEdge[] = []
  const seen = new Set<string>()
  for (const e of GRAPH.edges) {
    if (!kept.has(e.source) || !kept.has(e.target)) continue
    if (!edgePasses(e, fo)) continue
    const eid = `${e.source}->${e.target}:${e.kind}`
    if (seen.has(eid)) continue
    seen.add(eid)
    edges.push({ id: eid, source: e.source, target: e.target, kind: e.kind, sign: e.sign, op: e.op, strength: e.strength, provenance: e.provenance, confidence: e.confidence })
  }

  const nodes: ViewNode[] = [...kept].map((id) => {
    const tier = nodeTier(id)
    const gn = getNode(id)!
    return { id, layer: tier, role: CTRL_ROLE[gn.controllability], hiddenIn: 0, hiddenOut: 0 }
  })

  return { nodes, edges, focusId: '' }
}

export function generate(focusId: string, opts: GenOptions): GeneratedView {
  const { depth, cap } = VOL[opts.volume]
  const layerOf = new Map<string, number>()
  layerOf.set(focusId, 0)

  // causal-линза ориентирована (драйверы = входящие влияния); formula/diagnostic — неориентированы
  // (декомпозиция / соседи-предикторы веером от фокуса, все «вправо»).
  const directed = opts.lens === 'causal'
  const wantDrivers = opts.mode === 'map' || opts.treeDir === 'drivers'
  const wantOutcomes = opts.mode === 'map' || opts.treeDir === 'outcomes'

  type QItem = { id: string; layer: number; extra: boolean }
  const queue: QItem[] = [{ id: focusId, layer: 0, extra: false }]
  while (queue.length) {
    const { id, layer, extra } = queue.shift()!
    const localDepth = extra ? depth + 2 : depth // раскрытые узлы тянут дальше
    if (Math.abs(layer) >= localDepth) continue
    const visit = (other: string, nl: number) => {
      if (!layerOf.has(other) || Math.abs(layerOf.get(other)!) > Math.abs(nl)) {
        layerOf.set(other, nl)
        queue.push({ id: other, layer: nl, extra: extra || opts.expanded.has(other) })
      }
    }
    if (directed) {
      if (wantDrivers) for (const e of inEdges(id)) if (edgePasses(e, opts)) visit(e.source, layer - 1)
      if (wantOutcomes) for (const e of outEdges(id)) if (edgePasses(e, opts)) visit(e.target, layer + 1)
    } else {
      // неориентированно: любой сосед по ребру линзы = компонент/предиктор, кладём «правее» (layer−1)
      for (const e of inEdges(id)) if (edgePasses(e, opts)) visit(e.source, layer - 1)
      for (const e of outEdges(id)) if (edgePasses(e, opts)) visit(e.target, layer - 1)
    }
  }

  // degree-cap на слой (кроме раскрытых вручную и фокуса)
  const byLayer = new Map<number, string[]>()
  for (const [id, l] of layerOf) {
    if (!byLayer.has(l)) byLayer.set(l, [])
    byLayer.get(l)!.push(id)
  }
  const kept = new Set<string>([focusId])
  for (const [l, ids] of byLayer) {
    if (l === 0) continue
    const sorted = ids.sort((a, b) => nodeDegree(b) - nodeDegree(a))
    let taken = 0
    for (const id of sorted) {
      if (opts.expanded.has(id) || taken < cap) {
        kept.add(id)
        taken++
      }
    }
  }

  // рёбра между оставленными
  const edges: ViewEdge[] = []
  const seen = new Set<string>()
  for (const e of GRAPH.edges) {
    if (!kept.has(e.source) || !kept.has(e.target)) continue
    if (!edgePasses(e, opts)) continue
    // formula/diagnostic: ориентируем к фокусу (глубже→ближе), чтобы поток был согласован (компонент→результат)
    let src = e.source, tgt = e.target
    if (!directed) {
      const ls = Math.abs(layerOf.get(e.source) ?? 0); const lt = Math.abs(layerOf.get(e.target) ?? 0)
      if (ls < lt) { src = e.target; tgt = e.source }
    }
    const eid = `${src}->${tgt}:${e.kind}`
    if (seen.has(eid)) continue
    seen.add(eid)
    edges.push({ id: eid, source: src, target: tgt, kind: e.kind, sign: e.sign, op: e.op, strength: e.strength, provenance: e.provenance, confidence: e.confidence })
  }

  // скрытые счётчики: соседи по линзе, прошедшие фильтр, но не в виде
  const nodes: ViewNode[] = [...kept].map((id) => {
    const layer = layerOf.get(id)!
    const role: ContextRole = layer === 0 ? 'focus' : layer < 0 ? 'driver' : 'outcome'
    let hiddenIn = 0
    let hiddenOut = 0
    for (const e of inEdges(id)) if (edgePasses(e, opts) && !kept.has(e.source)) hiddenIn++
    for (const e of outEdges(id)) if (edgePasses(e, opts) && !kept.has(e.target)) { if (directed) hiddenOut++; else hiddenIn++ }
    return { id, layer, role, hiddenIn, hiddenOut }
  })

  return { nodes, edges, focusId }
}
