import ELK from 'elkjs/lib/elk.bundled.js'
import type { ElkNode } from 'elkjs/lib/elk-api'
import type { GeneratedView, ViewMode } from '../engine/generate'
import { NODE_H, NODE_W } from '../flow/tokens'
import type { Positioned } from './layered'

const elk = new ELK()

export interface ElkResult {
  positions: Map<string, Positioned>
  /** маршрут ребра (ортогональные bend points в абс. координатах) для чистых дорожек */
  edgePoints: Map<string, [number, number][]>
}

// Раскладка через ELK layered: минимизирует пересечения + ортогональный роутинг рёбер.
// Дерево: корень (фокус) слева, драйверы вправо → direction LEFT (рёбра драйвер→фокус текут к фокусу).
// Карта: ярусы сверху вниз → direction DOWN.
export async function elkLayout(view: GeneratedView, mode: ViewMode): Promise<ElkResult> {
  const direction = mode === 'tree' ? 'LEFT' : 'DOWN'
  const graph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': direction,
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.layered.spacing.nodeNodeBetweenLayers': '110',
      'elk.spacing.nodeNode': '30',
      'elk.layered.spacing.edgeNodeBetweenLayers': '24',
      'elk.layered.spacing.edgeEdgeBetweenLayers': '14',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
    },
    children: view.nodes.map((n) => ({ id: n.id, width: NODE_W, height: NODE_H })),
    edges: view.edges.map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
  }

  const res = await elk.layout(graph)
  const positions = new Map<string, Positioned>()
  for (const c of res.children ?? []) positions.set(c.id, { id: c.id, x: c.x ?? 0, y: c.y ?? 0 })

  const edgePoints = new Map<string, [number, number][]>()
  for (const e of res.edges ?? []) {
    const sec = e.sections?.[0]
    if (!sec) continue
    const pts: [number, number][] = [[sec.startPoint.x, sec.startPoint.y]]
    for (const b of sec.bendPoints ?? []) pts.push([b.x, b.y])
    pts.push([sec.endPoint.x, sec.endPoint.y])
    edgePoints.set(e.id, pts)
  }
  return { positions, edgePoints }
}
