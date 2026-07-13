import { DEMO_TIERS } from './demo'
import { SAAS } from './saas'
import type { Graph, GraphEdge, GraphNode, MapTier } from './types'

// Дебютная вертикаль SaaS-удержание/рост (497 узлов / 1288 рёбер, provenance-размечена).
export const GRAPH: Graph = SAAS

const byId = new Map<string, GraphNode>()
for (const n of GRAPH.nodes) byId.set(n.id, n)

const outAdj = new Map<string, GraphEdge[]>()
const inAdj = new Map<string, GraphEdge[]>()
for (const e of GRAPH.edges) {
  if (!outAdj.has(e.source)) outAdj.set(e.source, [])
  if (!inAdj.has(e.target)) inAdj.set(e.target, [])
  outAdj.get(e.source)!.push(e)
  inAdj.get(e.target)!.push(e)
}

const degree = new Map<string, number>()
for (const n of GRAPH.nodes) degree.set(n.id, (outAdj.get(n.id)?.length ?? 0) + (inAdj.get(n.id)?.length ?? 0))

// поиск ребра по паре+модальности (в обе стороны — раскладка может флипать направление)
const edgeMap = new Map<string, GraphEdge>()
for (const e of GRAPH.edges) edgeMap.set(`${e.source}->${e.target}:${e.kind}`, e)
export const findEdge = (a: string, b: string, kind: string): GraphEdge | undefined =>
  edgeMap.get(`${a}->${b}:${kind}`) ?? edgeMap.get(`${b}->${a}:${kind}`)

export const getNode = (id: string) => byId.get(id)
export const outEdges = (id: string) => outAdj.get(id) ?? []
export const inEdges = (id: string) => inAdj.get(id) ?? []
export const nodeDegree = (id: string) => degree.get(id) ?? 0
export const allNodes = (): GraphNode[] => GRAPH.nodes
/** Ярус метрики на карте (LOD). Данность узла → карта DEMO_TIERS → tier 3. */
export const nodeTier = (id: string): MapTier => byId.get(id)?.tier ?? DEMO_TIERS[id] ?? 3

export function searchNodes(q: string, limit = 12): GraphNode[] {
  const s = q.trim().toLowerCase()
  if (!s) return []
  const scored: { n: GraphNode; score: number }[] = []
  for (const n of GRAPH.nodes) {
    const ru = n.ru.toLowerCase()
    const en = n.en.toLowerCase()
    let score = -1
    if (ru === s || en === s) score = 1000
    else if (ru.startsWith(s) || en.startsWith(s)) score = 500
    else if (ru.includes(s) || en.includes(s)) score = 200
    else if (n.section.toLowerCase().includes(s)) score = 50
    if (score >= 0) scored.push({ n, score: score + nodeDegree(n.id) })
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((x) => x.n)
}
