import { Position, type EdgeProps } from '@xyflow/react'
import type { EdgeKind } from '../graph/types'
import { edgeVisual, TOKENS } from './tokens'

export interface MetricEdgeData {
  kind: EdgeKind
  sign: string
  op?: string
  strength?: 'weak' | 'medium' | 'strong'
  provenance?: 'curated' | 'draft'
  confidence?: 'low' | 'medium' | 'high' // низкая уверенность влияния рисуется пунктиром/тоньше (гипотеза ≠ выверено)
  points?: [number, number][] // ELK-маршрут (абс. bend points); если есть — рисуем по нему
  dim?: boolean
  active?: boolean
  showSign?: boolean // знак/нотация показываются только при наведении (declutter)
  [key: string]: unknown
}

const STRENGTH_W: Record<string, number> = { weak: 1.1, medium: 1.7, strong: 2.4 }

function roundedPath(pts: [number, number][], r: number): string {
  if (pts.length < 2) return ''
  if (pts.length === 2) return `M ${pts[0][0]} ${pts[0][1]} L ${pts[1][0]} ${pts[1][1]}`
  let d = `M ${pts[0][0]} ${pts[0][1]}`
  for (let i = 1; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i - 1]; const [x1, y1] = pts[i]; const [x2, y2] = pts[i + 1]
    const l1 = Math.hypot(x0 - x1, y0 - y1) || 1; const l2 = Math.hypot(x2 - x1, y2 - y1) || 1
    const rr = Math.min(r, l1 / 2, l2 / 2)
    const a = [x1 + ((x0 - x1) / l1) * rr, y1 + ((y0 - y1) / l1) * rr]
    const b = [x1 + ((x2 - x1) / l2) * rr, y1 + ((y2 - y1) / l2) * rr]
    d += ` L ${a[0]} ${a[1]} Q ${x1} ${y1} ${b[0]} ${b[1]}`
  }
  const last = pts[pts.length - 1]
  d += ` L ${last[0]} ${last[1]}`
  return d
}

function arrow(tip: [number, number], from: [number, number], color: string) {
  const dx = tip[0] - from[0]; const dy = tip[1] - from[1]
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len; const uy = dy / len // направление к кончику
  const px = -uy; const py = ux // перпендикуляр
  const s = 6.5; const w = 4
  const bx = tip[0] - ux * s; const by = tip[1] - uy * s
  return `${bx + px * w},${by + py * w} ${tip[0]},${tip[1]} ${bx - px * w},${by - py * w}`
}

export function MetricEdge({ sourceX, sourceY, targetX, targetY, sourcePosition, data }: EdgeProps) {
  const d = (data ?? {}) as MetricEdgeData
  const vis = edgeVisual(d.kind, d.sign, d.op)
  const dimmed = d.dim && !d.active
  // черновой слой (не финально выверен) рисуем полупрозрачно — виден, но явно вторичен
  const draft = d.provenance === 'draft'
  // низкая уверенность влияния = гипотеза: тоньше, пунктиром, приглушённо (отличать от выверенной связи прямо на графе)
  const lowConf = d.kind === 'influence' && d.confidence === 'low'
  const baseOpacity = dimmed ? 0.22 : draft ? 0.42 : lowConf ? 0.5 : 1
  const horizontal = sourcePosition === Position.Left || sourcePosition === Position.Right

  let pts: [number, number][]
  if (d.points && d.points.length >= 2) {
    // ELK уже развёл дорожки — рисуем ровно по его маршруту
    pts = d.points
  } else if (horizontal) {
    const midX = (sourceX + targetX) / 2
    pts = Math.abs(sourceY - targetY) < 1
      ? [[sourceX, sourceY], [targetX, targetY]]
      : [[sourceX, sourceY], [midX, sourceY], [midX, targetY], [targetX, targetY]]
  } else {
    const midY = (sourceY + targetY) / 2
    pts = Math.abs(sourceX - targetX) < 1
      ? [[sourceX, sourceY], [targetX, targetY]]
      : [[sourceX, sourceY], [sourceX, midY], [targetX, midY], [targetX, targetY]]
  }
  const path = roundedPath(pts, 9)
  // знак/оператор — на середине центрального сегмента маршрута; стрелка — в последней точке
  const midSeg = Math.max(0, Math.floor((pts.length - 1) / 2))
  const mid = [(pts[midSeg][0] + pts[midSeg + 1][0]) / 2, (pts[midSeg][1] + pts[midSeg + 1][1]) / 2]
  const tip = pts[pts.length - 1]
  const preTip = pts[pts.length - 2]
  const baseW = STRENGTH_W[d.strength ?? 'medium'] ?? 1.7
  const w = (d.active ? baseW + 0.7 : baseW) * (lowConf ? 0.72 : 1)

  return (
    <g style={{ opacity: baseOpacity, transition: 'opacity .17s ease' }}>
      {/* невидимая широкая дорожка = зона клика/наведения */}
      <path d={path} fill="none" stroke="transparent" strokeWidth={16} style={{ cursor: 'pointer', pointerEvents: 'stroke' }} />
      <path d={path} fill="none" stroke={vis.color} strokeWidth={w} style={{ pointerEvents: 'none' }}
        strokeLinecap="round" strokeLinejoin="round" strokeDasharray={vis.dashed ? '1.5 6' : lowConf ? '5 4' : undefined} />
      {vis.arrow && <polygon points={arrow([tip[0], tip[1]], preTip, vis.color)} fill={vis.color} />}
      {d.showSign && (
        <text x={mid[0]} y={mid[1]} textAnchor="middle" dominantBaseline="central"
          fontFamily={TOKENS.fontMono} fontSize={12} fontWeight={700} fill={vis.color}
          stroke={TOKENS.bg} strokeWidth={3.5} paintOrder="stroke" style={{ pointerEvents: 'none' }}>
          {vis.label}
        </text>
      )}
    </g>
  )
}
