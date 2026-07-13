import { memo, useState } from 'react'
import { BaseEdge, EdgeLabelRenderer, Position, type EdgeProps } from '@xyflow/react'
import { signColor } from '../atlas/style'

export interface MetricEdgeData {
  sign: '+' | '-'
  kind: 'influence' | 'associative'
  dimmed?: boolean
  active?: boolean
  offset?: number
  // Сдвиг средней перпендикулярной полосы (лейна): разводит рёбра, которые
  // иначе шли бы вплотную-параллельно в одном коридоре (см. MapView, laneShift).
  lane?: number
  // Обратное ребро встречной пары A↔B: рисуем петлёй сверху, а не параллельной прямой.
  loop?: boolean
  // Координата средней полосы (X для гориз. ребра, Y для верт.), выбранная в MapView
  // с обходом чужих карточек. Если нет — берём геометрическую середину.
  chan?: number
  // Разнесение портов: сдвиг точки привязки ВДОЛЬ грани карточки (перпендикулярно
  // хэндлу), чтобы несколько связей на одной грани не втыкались в одну точку —
  // иначе вход одной связи совпадает со стартом другой (см. MapView, port-распорка).
  sPort?: number
  tPort?: number
  // Онбординг: принудительно показать иконку «i» на этой связи без наведения.
  forceInfo?: boolean
  [key: string]: unknown
}

// Ортогональная ломаная со скруглёнными углами по списку точек.
function roundPoly(pts: [number, number][], r: number): string {
  if (pts.length < 2) return ''
  let d = `M ${pts[0][0]},${pts[0][1]}`
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1], [cx, cy] = pts[i], [nx, ny] = pts[i + 1]
    const l1 = Math.hypot(cx - px, cy - py), l2 = Math.hypot(nx - cx, ny - cy)
    const rr = Math.min(r, l1 / 2, l2 / 2)
    const a: [number, number] = [cx - (cx - px) / (l1 || 1) * rr, cy - (cy - py) / (l1 || 1) * rr]
    const b: [number, number] = [cx + (nx - cx) / (l2 || 1) * rr, cy + (ny - cy) / (l2 || 1) * rr]
    d += ` L ${a[0]},${a[1]} Q ${cx},${cy} ${b[0]},${b[1]}`
  }
  const last = pts[pts.length - 1]
  d += ` L ${last[0]},${last[1]}`
  return d
}

// Выровненная пара (разница центров меньше порога) → строгая прямая без
// микро-ступеньки. Иначе — ОРТОГОНАЛЬНЫЙ путь (прямые углы, как в оригинале).
const ALIGN_EPS = 8
// Хэндл не доходит до края карточки на пару пикселей → у «хвостового» конца
// (без наконечника) виден зазор. Утапливаем оба конца ВНУТРЬ своих карточек:
// рёбра рисуются под карточками, поэтому излишек прячется, а зазора нет.
const DOCK = 12
// Единичный вектор «внутрь карточки» (противоположно стороне хэндла).
function inward(pos: Position): [number, number] {
  if (pos === Position.Left) return [1, 0]
  if (pos === Position.Right) return [-1, 0]
  if (pos === Position.Top) return [0, 1]
  return [0, -1]
}

function MetricEdgeBase(props: EdgeProps) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd } = props
  const d = (data ?? {}) as MetricEdgeData
  const [hover, setHover] = useState(false)
  // Хвост (source, без наконечника) всегда утапливаем в карточку. Целевой конец
  // трогаем только у пунктирных (associative) — у influence там наконечник,
  // который сам стыкуется к краю; утопив его, мы бы спрятали стрелку под карточку.
  const [six, siy] = inward(sourcePosition)
  const [tix, tiy] = inward(targetPosition)
  const tDock = markerEnd ? 0 : DOCK
  let sx = sourceX + six * DOCK, sy = sourceY + siy * DOCK
  let tx = targetX + tix * tDock, ty = targetY + tiy * tDock
  // Встречную пару A↔B разводим параллельным сдвигом, чтобы не рисовать внахлёст.
  if (d.offset) {
    const horiz = sourcePosition === Position.Left || sourcePosition === Position.Right
    if (horiz) { sy += d.offset; ty += d.offset } else { sx += d.offset; tx += d.offset }
  }
  const horizontal = sourcePosition === Position.Left || sourcePosition === Position.Right
  // Порт-распорка: двигаем точку привязки вдоль грани (перпендикулярно хэндлу).
  // На боковой грани (Left/Right) — по Y, на верх/низ (Top/Bottom) — по X.
  if (d.sPort) { if (horizontal) sy += d.sPort; else sx += d.sPort }
  if (d.tPort) {
    const tHoriz = targetPosition === Position.Left || targetPosition === Position.Right
    if (tHoriz) ty += d.tPort; else tx += d.tPort
  }
  const aligned = horizontal ? Math.abs(sy - ty) <= ALIGN_EPS : Math.abs(sx - tx) <= ALIGN_EPS
  const lane = d.lane ?? 0
  let path: string
  let lx: number, ly: number // точка для иконки «i» (середина связи)
  if (d.loop) {
    // Обратное (feedback) ребро встречной пары: огибаем сверху прямоугольной петлёй
    // (как в оригинале Miro), чтобы не рисовать вплотную к прямой стрелке пары.
    const LOOP = 44
    const topY = Math.min(sy, ty) - LOOP
    path = roundPoly([[sx, sy], [sx, topY], [tx, topY], [tx, ty]], 8)
    lx = (sx + tx) / 2; ly = topY
  } else if (aligned) {
    path = horizontal ? `M ${sx},${sy} L ${tx},${sy}` : `M ${sx},${sy} L ${sx},${ty}`
    lx = horizontal ? (sx + tx) / 2 : sx
    ly = horizontal ? sy : (sy + ty) / 2
  } else if (horizontal) {
    // Свой детерминированный Z: средняя ВЕРТИКАЛЬНАЯ полоса на chan (обход карточек
    // из MapView) либо на midX (+lane). Цепочки ложатся в один канал без ступенек.
    const midX = (d.chan ?? (sx + tx) / 2) + lane
    path = roundPoly([[sx, sy], [midX, sy], [midX, ty], [tx, ty]], 8)
    lx = midX; ly = (sy + ty) / 2
  } else {
    // Средняя ГОРИЗОНТАЛЬНАЯ полоса на chan либо на midY (+lane).
    const midY = (d.chan ?? (sy + ty) / 2) + lane
    path = roundPoly([[sx, sy], [sx, midY], [tx, midY], [tx, ty]], 8)
    lx = (sx + tx) / 2; ly = midY
  }
  const color = signColor(d.sign)
  const dashed = d.kind === 'associative'
  const showInfo = hover || !!d.forceInfo
  const emphasis = d.active || hover || !!d.forceInfo
  const opacity = d.dimmed ? 0.12 : dashed ? 0.55 : 0.85
  return (
    <>
      <BaseEdge
        id={props.id}
        path={path}
        markerEnd={markerEnd}
        style={{
          stroke: color,
          strokeWidth: emphasis ? 2.6 : 1.6,
          strokeDasharray: dashed ? '6 6' : undefined,
          opacity: hover ? Math.max(opacity, 0.95) : opacity,
        }}
      />
      {/* Широкая невидимая дорожка — ховер/курсор: тонкую линию трудно поймать. */}
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        style={{ cursor: 'pointer', pointerEvents: d.dimmed ? 'none' : 'stroke' }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      />
      {/* Иконка «i» посередине связи — появляется по наведению, поверх всех слоёв.
          В онбординге (forceInfo) — крупнее, залита цветом и пульсирует, чтобы её
          нельзя было не заметить под подсказкой. */}
      {showInfo && !d.dimmed && (
        <EdgeLabelRenderer>
          <div
            className={`edge-info${d.forceInfo ? ' edge-info--tour' : ''}`}
            style={{
              position: 'absolute',
              transform: `translate(-50%,-50%) translate(${lx}px,${ly}px)`,
              ...(d.forceInfo
                ? { background: color, color: '#fff', ['--ring' as string]: color }
                : { borderColor: color, color }),
              pointerEvents: 'none',
            }}
          >
            i
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

export const MetricEdge = memo(MetricEdgeBase)
