import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow, ReactFlowProvider, Background, MiniMap, Panel, useReactFlow,
  MarkerType, type Node, type Edge, type Viewport,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { buildMap } from '../atlas/atlas'
import { nodeById } from '../atlas/atlas'
import { MetricNode } from './MetricNode'
import { MetricEdge } from './MetricEdge'
import { GroupNode } from './GroupNode'
import { NodeCard } from './NodeCard'
import { EdgeCard } from './EdgeCard'
import { Tour, type TourStep } from './Tour'
import { roleStyle, signColor } from '../atlas/style'
import type { AtlasEdge } from '../atlas/types'

const nodeTypes = { metric: MetricNode, group: GroupNode }
const edgeTypes = { metric: MetricEdge }

// Отступ рамки подраздела от крайних карточек внутри него.
const GROUP_PAD = 26

type Mode = 'spine' | 'full'

// Формулировки взяты дословно из легенды Атласа.
const ROLE_INFO: Record<string, { title: string; text: string }> = {
  result: { title: 'Метрики результата', text: 'Показатели, которые являются результатом влияния других метрик (часто количественные накопленные).' },
  action: { title: 'Метрики действия', text: 'Метрики, на которые можно воздействовать напрямую.' },
  cost: { title: 'Метрики затрат', text: 'Метрики, которые связаны с инвестициями и затратами для функционирования процессов.' },
  diagnostic: { title: 'Диагностические метрики', text: 'Показывают эффективность процесса. Ими нельзя управлять напрямую. Зачастую это коэффициенты, индексы и %.' },
}

function Legend({ counts, activeRole, onToggleRole }: {
  counts: Record<string, number>
  activeRole: string | null
  onToggleRole: (role: string) => void
}) {
  const roles: [string, string][] = [
    ['result', 'Результат'], ['action', 'Действие'], ['cost', 'Затраты'], ['diagnostic', 'Диагностика'],
  ]
  return (
    <div className="legend" data-tour="legend">
      <h4>Роль метрики <span className="legend__hint">кликните — подсветит</span></h4>
      {roles.map(([r, l]) => (
        <button
          type="button"
          className={`legend__role${activeRole === r ? ' is-active' : ''}`}
          key={r}
          onClick={() => onToggleRole(r)}
          aria-pressed={activeRole === r}
          title={`Подсветить все метрики роли «${l}»`}
        >
          <span className="legend__dot" style={{ background: roleStyle(r).color }} />
          <span className="legend__lbl">{l}</span>
          <span className="legend__cnt">{counts[r] ?? 0}</span>
          <span
            className="legend__info" tabIndex={0} aria-label={`О роли «${l}»`}
            onClick={(e) => e.stopPropagation()}
          >
            i
            <span className="legend__tip" role="tooltip">
              <b style={{ color: roleStyle(r).text }}>{ROLE_INFO[r].title}</b>
              {ROLE_INFO[r].text}
            </span>
          </span>
        </button>
      ))}
      <h4 style={{ marginTop: 10 }}>Связь <span className="legend__hint">кликните — объяснит</span></h4>
      <div className="legend__row"><span className="legend__line" style={{ borderTop: '2px solid #0E9C7D' }} />Прямая (рост→рост)</div>
      <div className="legend__row"><span className="legend__line" style={{ borderTop: '2px solid #FF5C60' }} />Обратная (рост→спад)</div>
      <div className="legend__row"><span className="legend__line" style={{ borderTop: '2px dashed #98A0A6' }} />Пунктир, связь без влияния</div>
    </div>
  )
}

// Зум-контролы рядом с миниатюрой: +, −, сброс к стартовому масштабу.
function ZoomControls({ home }: { home: Viewport }) {
  const { zoomIn, zoomOut, setViewport } = useReactFlow()
  return (
    <Panel position="bottom-right" className="zoomctl">
      <button onClick={() => zoomIn({ duration: 160 })} title="Приблизить" aria-label="Приблизить">+</button>
      <button onClick={() => zoomOut({ duration: 160 })} title="Отдалить" aria-label="Отдалить">−</button>
      <button onClick={() => setViewport(home, { duration: 240 })} title="Сбросить масштаб" aria-label="Сбросить масштаб">⤢</button>
    </Panel>
  )
}

type SearchNode = { id: string; name: string; role: string; px: number; py: number; w: number; h: number }

// Минималистичный поиск: иконка-лупа, по клику разворачивается поле.
function SearchBox({ nodes, onPick, onHelp }: { nodes: SearchNode[]; onPick: (id: string) => void; onHelp: () => void }) {
  const { setCenter } = useReactFlow()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const query = q.trim().toLowerCase()
  const matches = query.length >= 2
    ? nodes.filter((n) => n.name.toLowerCase().includes(query)).slice(0, 7)
    : []
  const pick = (n: SearchNode) => {
    setCenter(n.px + n.w / 2, n.py + n.h / 2, { zoom: 1, duration: 400 })
    onPick(n.id)
    setQ(''); setOpen(false)
  }
  return (
    <>
      <button className="help__btn" onClick={onHelp} title="Как читать карту" aria-label="Как читать карту">?</button>
      {!open ? (
        <button className="search__btn" data-tour="search" onClick={() => setOpen(true)} title="Поиск метрики" aria-label="Поиск метрики">
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" />
          </svg>
        </button>
      ) : (
        <div className="search__box" data-tour="search">
          <svg className="search__ic" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" />
          </svg>
          <input
            autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти метрику…"
            onKeyDown={(e) => {
              if (e.key === 'Escape') { setOpen(false); setQ('') }
              if (e.key === 'Enter' && matches[0]) pick(matches[0])
            }}
          />
          <button className="search__x" onClick={() => { setOpen(false); setQ('') }} aria-label="Закрыть">✕</button>
          {matches.length > 0 && (
            <ul className="search__list">
              {matches.map((n) => (
                <li key={n.id} onClick={() => pick(n)}>
                  <span className="search__d" style={{ background: roleStyle(n.role).color }} />
                  <span className="search__nm">{n.name}</span>
                </li>
              ))}
            </ul>
          )}
          {query.length >= 2 && matches.length === 0 && <div className="search__empty">Ничего не найдено</div>}
        </div>
      )}
    </>
  )
}

type FlowApi = { setCenter: (x: number, y: number, opts?: { zoom?: number; duration?: number }) => void }

// Мост: вытаскиваем setCenter из провайдера, чтобы центрировать карту
// из панели метрики (она рендерится вне <ReactFlow>).
function FlowBridge({ apiRef }: { apiRef: React.MutableRefObject<FlowApi | null> }) {
  const { setCenter } = useReactFlow()
  apiRef.current = { setCenter }
  return null
}

export function MapView({ section, onBack }: { section: string; onBack: () => void }) {
  const [mode, setMode] = useState<Mode>(() =>
    (typeof location !== 'undefined' && new URLSearchParams(location.search).get('mode') === 'spine')
      ? 'spine' : 'full')
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [selNode, setSelNode] = useState<string | null>(() =>
    (typeof location !== 'undefined' && new URLSearchParams(location.search).get('node')) || null)
  const [selEdge, setSelEdge] = useState<AtlasEdge | null>(null)
  // Подсветка всех метрик одной роли (клик по роли в легенде). Взаимоисключается
  // с выбором узла/связи: включил роль — снял выделение, и наоборот.
  const [activeRole, setActiveRole] = useState<string | null>(null)
  // Онбординг-тур.
  const [tourOn, setTourOn] = useState(false)
  // Связь, у которой на время шага тура принудительно показана иконка «i».
  const [forceEdgeKey, setForceEdgeKey] = useState<string | null>(null)

  const map = useMemo(() => buildMap(section), [section])

  // Ключевая метрика карты + показательная влияющая связь (для шагов тура).
  const keyNodeId = useMemo(() => map.nodes.find((n) => n.key)?.id ?? null, [map])
  const demoEdge = useMemo(() => {
    const inKey = keyNodeId && map.edges.find((e) => e.kind === 'influence' && e.target === keyNodeId)
    return inKey || map.edges.find((e) => e.kind === 'influence') || null
  }, [map, keyNodeId])
  const demoEdgeKey = demoEdge ? `${demoEdge.source}__${demoEdge.target}` : null

  // Кол-во метрик каждой роли на этой карте (по всей карте, не по режиму).
  const roleCounts = useMemo(() => {
    const c: Record<string, number> = { result: 0, action: 0, cost: 0, diagnostic: 0 }
    for (const n of map.nodes) if (c[n.role] !== undefined) c[n.role]++
    return c
  }, [map])

  // Детерминированный стартовый вьюпорт: подгонка по ШИРИНЕ на читаемом зуме,
  // якорь сверху (высокие карты скроллятся вниз, узлы остаются крупными).
  const viewport = useMemo(() => {
    const cw = (typeof window !== 'undefined' ? window.innerWidth : 1440)
    const z = Math.min(1.0, Math.max(0.45, (cw * 0.9) / map.width))
    return { x: (cw - map.width * z) / 2, y: 28, zoom: z }
  }, [map])

  const { rfNodes, rfEdges } = useMemo(() => {
    const spine = mode === 'spine'
    let visIds: Set<string>
    if (spine) {
      // База свёрнутого: причинный позвоночник — всё, кроме диагностики.
      const keep = new Set(map.nodes.filter((n) => n.role !== 'diagnostic').map((n) => n.id))
      // Поверх гарантируем ключевую метрику и всю её причинную ветку вверх
      // (по влиянию), даже если предки — диагностические.
      const preds = new Map<string, string[]>()
      for (const e of map.edges) {
        if (e.kind !== 'influence') continue
        ;(preds.get(e.target) ?? preds.set(e.target, []).get(e.target)!).push(e.source)
      }
      const stack = map.nodes.filter((n) => n.key).map((n) => n.id)
      stack.forEach((id) => keep.add(id))
      while (stack.length) {
        const cur = stack.pop()!
        for (const p of preds.get(cur) ?? []) if (!keep.has(p)) { keep.add(p); stack.push(p) }
      }
      visIds = keep
    } else {
      visIds = new Set(map.nodes.map((n) => n.id))
    }
    const visNodes = map.nodes.filter((n) => visIds.has(n.id))
    const visEdges = map.edges.filter(
      (e) => visIds.has(e.source) && visIds.has(e.target) && (spine ? e.kind === 'influence' : true),
    )

    // Выбор (клик) главнее наведения: кликнул метрику — вся причинная цепочка
    // подсвечивается сразу и держится, даже если курсор остаётся на карточке.
    // Наведение подсвечивает прямых соседей только когда ничего не выбрано.
    const focus = selNode ?? hoverId
    const chainMode = !!selNode
    const neigh = new Set<string>()
    if (focus) {
      neigh.add(focus)
      if (chainMode) {
        const succ = new Map<string, string[]>(), pred = new Map<string, string[]>()
        for (const e of visEdges) {
          if (e.kind !== 'influence') continue
          ;(succ.get(e.source) ?? succ.set(e.source, []).get(e.source)!).push(e.target)
          ;(pred.get(e.target) ?? pred.set(e.target, []).get(e.target)!).push(e.source)
        }
        const walk = (adj: Map<string, string[]>) => {
          const st = [focus]
          while (st.length) {
            const c = st.pop()!
            for (const n of adj.get(c) ?? []) if (!neigh.has(n)) { neigh.add(n); st.push(n) }
          }
        }
        walk(succ); walk(pred)
      } else {
        visEdges.forEach((e) => {
          if (e.source === focus) neigh.add(e.target)
          if (e.target === focus) neigh.add(e.source)
        })
      }
    }

    const metricNodes: Node[] = visNodes.map((n) => ({
      id: n.id,
      type: 'metric',
      position: { x: n.px, y: n.py },
      width: n.w,
      height: n.h,
      style: { width: n.w, height: n.h },
      // Наведённая/выбранная нода выше соседей — иначе её тултип единицы (вылезающий
      // за карточку) прячется под соседними карточками.
      zIndex: hoverId === n.id || selNode === n.id ? 10 : 1,
      data: {
        name: n.name, role: n.role, units: n.units, w: n.w, h: n.h,
        key: n.key,
        selected: selNode === n.id,
        hovered: hoverId === n.id,
        // Роль-подсветка главнее окрестности: активна роль → метрики этой роли ярко,
        // остальные приглушены; иначе — обычная логика окрестности фокуса.
        highlight: activeRole ? n.role === activeRole : false,
        dimmed: activeRole ? n.role !== activeRole : (focus ? !neigh.has(n.id) : false),
      },
      draggable: false, selectable: true,
    }))

    // Рамки подразделов (авторская группировка): по всем видимым членам группы —
    // общий bounding box + padding. Кладём позади карточек, клики пропускаем.
    const gb = new Map<string, { x0: number; y0: number; x1: number; y1: number }>()
    for (const n of visNodes) {
      if (!n.group) continue
      const b = gb.get(n.group) ?? { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
      b.x0 = Math.min(b.x0, n.px); b.y0 = Math.min(b.y0, n.py)
      b.x1 = Math.max(b.x1, n.px + n.w); b.y1 = Math.max(b.y1, n.py + n.h)
      gb.set(n.group, b)
    }
    // Выравниваем рамки только когда группы РЕАЛЬНО разделяются по оси
    // (непересекающиеся проекции): колонки → общая высота, полосы → общая ширина.
    // 2D-разброс (проекции пересекаются по обеим осям) оставляем плотными рамками,
    // иначе выровненные фреймы наедут друг на друга и заголовки столкнутся.
    const boxes = [...gb.values()]
    const gX0 = Math.min(...boxes.map((b) => b.x0)), gX1 = Math.max(...boxes.map((b) => b.x1))
    const gY0 = Math.min(...boxes.map((b) => b.y0)), gY1 = Math.max(...boxes.map((b) => b.y1))
    const TOL = 40 // допустимое перекрытие проекций, px
    const separable = (lo: (b: typeof boxes[0]) => number, hi: (b: typeof boxes[0]) => number) => {
      const s = [...boxes].sort((a, b) => lo(a) - lo(b))
      for (let i = 1; i < s.length; i++) if (lo(s[i]) < hi(s[i - 1]) - TOL) return false
      return true
    }
    const columns = boxes.length > 1 && separable((b) => b.x0, (b) => b.x1)
    const rows = boxes.length > 1 && !columns && separable((b) => b.y0, (b) => b.y1)
    const groupNodes: Node[] = [...gb.entries()].map(([title, b]) => {
      const x0 = rows ? gX0 : b.x0
      const x1 = rows ? gX1 : b.x1
      const y0 = columns ? gY0 : b.y0
      const y1 = columns ? gY1 : b.y1
      const w = x1 - x0 + GROUP_PAD * 2
      const h = y1 - y0 + GROUP_PAD * 2
      return {
        id: `grp:${title}`,
        type: 'group',
        position: { x: x0 - GROUP_PAD, y: y0 - GROUP_PAD },
        width: w, height: h,
        // pointer-events на самой обёртке ноды: иначе большая рамка подраздела
        // перехватывает клики по рёбрам, проходящим под ней (рёбра в слое ниже).
        style: { width: w, height: h, pointerEvents: 'none' },
        zIndex: 0,
        data: { title },
        draggable: false, selectable: false, focusable: false,
      }
    })
    const rfNodes: Node[] = [...groupNodes, ...metricNodes]

    const pos = new Map(visNodes.map((n) => [n.id, n]))
    const edgeKeys = new Set(visEdges.map((e) => `${e.source}__${e.target}`))
    // Прямоугольники всех видимых карточек — препятствия для рёбер.
    const obst = visNodes.map((n) => ({ id: n.id, x0: n.px, y0: n.py, x1: n.px + n.w, y1: n.py + n.h, cx: n.px + n.w / 2, cy: n.py + n.h / 2 }))
    const boxById = new Map(obst.map((b) => [b.id, b]))
    const CLR = 12 // зазор от края карточки при обходе
    // Свободен ли вертикальный канал на X (плюс горизонтальные «усы» у концов)?
    const vClear = (X: number, sy: number, ty: number, sEx: number, tEn: number, sId: string, tId: string) => {
      const yLo = Math.min(sy, ty), yHi = Math.max(sy, ty)
      for (const b of obst) {
        if (b.id === sId || b.id === tId) continue
        if (b.x0 < X && X < b.x1 && b.y0 < yHi && b.y1 > yLo) return false
        if (b.y0 < sy && sy < b.y1) { const lo = Math.min(sEx, X), hi = Math.max(sEx, X); if (b.x0 < hi && b.x1 > lo) return false }
        if (b.y0 < ty && ty < b.y1) { const lo = Math.min(X, tEn), hi = Math.max(X, tEn); if (b.x0 < hi && b.x1 > lo) return false }
      }
      return true
    }
    const hClear = (Y: number, sx: number, tx: number, sEy: number, tEy: number, sId: string, tId: string) => {
      const xLo = Math.min(sx, tx), xHi = Math.max(sx, tx)
      for (const b of obst) {
        if (b.id === sId || b.id === tId) continue
        if (b.y0 < Y && Y < b.y1 && b.x0 < xHi && b.x1 > xLo) return false
        if (b.x0 < sx && sx < b.x1) { const lo = Math.min(sEy, Y), hi = Math.max(sEy, Y); if (b.y0 < hi && b.y1 > lo) return false }
        if (b.x0 < tx && tx < b.x1) { const lo = Math.min(Y, tEy), hi = Math.max(Y, tEy); if (b.y0 < hi && b.y1 > lo) return false }
      }
      return true
    }
    // Кандидаты положения канала: геом. середина + края карточек по нужной оси ±
    // зазор, отсортированы по близости к середине (ближайший свободный — победитель).
    const candsX = (mid: number) => {
      const cs = [mid]
      for (const b of obst) { cs.push(b.x0 - CLR, b.x1 + CLR) }
      return [...new Set(cs)].sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid))
    }
    const candsY = (mid: number) => {
      const cs = [mid]
      for (const b of obst) { cs.push(b.y0 - CLR, b.y1 + CLR) }
      return [...new Set(cs)].sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid))
    }
    type Geo = { sh: string; th: string; horiz: boolean; chan: number; c0: number; c1: number }
    const geo: Geo[] = visEdges.map((e) => {
      const S = boxById.get(e.source)!, T = boxById.get(e.target)!
      const dx = T.cx - S.cx, dy = T.cy - S.cy
      const vEx = dx >= 0 ? S.x1 : S.x0, vEn = dx >= 0 ? T.x0 : T.x1
      const hEy = dy >= 0 ? S.y1 : S.y0, hEn = dy >= 0 ? T.y0 : T.y1
      // Вертикальный канал (хэндлы лево/право) — обходим карточки по X.
      const tryV = (): Geo | null => {
        const mid = (vEx + vEn) / 2
        for (const X of candsX(mid)) if (vClear(X, S.cy, T.cy, vEx, vEn, S.id, T.id))
          return { sh: dx >= 0 ? 'sr' : 'sl', th: dx >= 0 ? 'tl' : 'tr', horiz: true, chan: X, c0: Math.min(S.cy, T.cy), c1: Math.max(S.cy, T.cy) }
        return null
      }
      // Горизонтальный канал (хэндлы низ/верх) — обходим карточки по Y.
      const tryH = (): Geo | null => {
        const mid = (hEy + hEn) / 2
        for (const Y of candsY(mid)) if (hClear(Y, S.cx, T.cx, hEy, hEn, S.id, T.id))
          return { sh: dy >= 0 ? 'sb' : 'st', th: dy >= 0 ? 'tt' : 'tb', horiz: false, chan: Y, c0: Math.min(S.cx, T.cx), c1: Math.max(S.cx, T.cx) }
        return null
      }
      // Предпочитаем естественную ориентацию (по большей дельте); если её канал
      // никак не провести без пересечений — пробуем другую; иначе — середина «как есть».
      const natural = Math.abs(dx) >= Math.abs(dy)
      const r = (natural ? (tryV() ?? tryH()) : (tryH() ?? tryV()))
      if (r) return r
      return natural
        ? { sh: dx >= 0 ? 'sr' : 'sl', th: dx >= 0 ? 'tl' : 'tr', horiz: true, chan: (vEx + vEn) / 2, c0: Math.min(S.cy, T.cy), c1: Math.max(S.cy, T.cy) }
        : { sh: dy >= 0 ? 'sb' : 'st', th: dy >= 0 ? 'tt' : 'tb', horiz: false, chan: (hEy + hEn) / 2, c0: Math.min(S.cx, T.cx), c1: Math.max(S.cx, T.cx) }
    })
    // Кластеры слипшихся вертикальных полос (горизонтальные рёбра): близкий midX +
    // перекрытие по Y. Разводим ТОЛЬКО «смешанные» коридоры (≥2 разных источника И
    // ≥2 разных цели) — чистые веера (много в одну цель / из одного источника)
    // выглядят аккуратно сами и остаются как есть.
    const LANE_TOL = 26, LANE_GAP = 26, Y_MIN = 30
    const lane = new Array(visEdges.length).fill(0)
    const hIdx = geo.map((g, i) => (g.horiz ? i : -1)).filter((i) => i >= 0)
    const parent = new Map(hIdx.map((i) => [i, i]))
    const find = (x: number): number => (parent.get(x) === x ? x : (parent.set(x, find(parent.get(x)!)), parent.get(x)!))
    for (let a = 0; a < hIdx.length; a++) for (let b = a + 1; b < hIdx.length; b++) {
      const i = hIdx[a], j = hIdx[b]
      if (Math.abs(geo[i].chan - geo[j].chan) < LANE_TOL &&
          Math.min(geo[i].c1, geo[j].c1) - Math.max(geo[i].c0, geo[j].c0) > Y_MIN) {
        parent.set(find(i), find(j))
      }
    }
    const clusters = new Map<number, number[]>()
    hIdx.forEach((i) => { const r = find(i); (clusters.get(r) ?? clusters.set(r, []).get(r)!).push(i) })
    for (const members of clusters.values()) {
      if (members.length < 2) continue
      const srcs = new Set(members.map((i) => visEdges[i].source))
      const tgts = new Set(members.map((i) => visEdges[i].target))
      if (srcs.size < 2 || tgts.size < 2) continue // чистый веер — не трогаем
      members.sort((i, j) => geo[i].chan - geo[j].chan)
      members.forEach((i, k) => { lane[i] = (k - (members.length - 1) / 2) * LANE_GAP })
    }
    // Признак «петли» (обратное ребро встречной пары A↔B) — считаем заранее, он нужен
    // и при разнесении портов (петли в распорке не участвуют), и ниже при рендере.
    const loopFlag = visEdges.map((e, i) => {
      const mutual = edgeKeys.has(`${e.target}__${e.source}`)
      const s = pos.get(e.source)!, t = pos.get(e.target)!
      const backward = geo[i].horiz
        ? (t.px + t.w / 2) < (s.px + s.w / 2)
        : (t.py + t.h / 2) < (s.py + s.h / 2)
      return mutual && geo[i].horiz && backward
    })
    // РАЗНЕСЕНИЕ ПОРТОВ. Несколько связей на одной грани карточки не должны втыкаться
    // в одну точку: вход одной тогда совпадает со стартом другой и читается как одна
    // сквозная линия (как в Miro: вход «Средней→Показы» увели левее старта «Показы→
    // Клики», а три нижних действия входят в «Среднюю» ниже коралловой). Группируем
    // привязки по (нода, грань); внутри — в «пучки» по (роль, канал): слитый веер
    // (общий канал) держит один порт, а вход/выход и разные каналы разводятся вдоль грани.
    const PORT_GAP = 26, PORT_MARGIN = 22, CHAN_BUCKET = 24
    const sideOf = (h: string) => h[1] // 'sr'|'tl'|... → второй символ = сторона r/l/t/b
    const sPort = new Array(visEdges.length).fill(0)
    const tPort = new Array(visEdges.length).fill(0)
    type Att = { i: number; end: 's' | 't'; role: string; sign: string; chan: number; ox: number; oy: number }
    const att = new Map<string, Att[]>()
    visEdges.forEach((e, i) => {
      if (loopFlag[i]) return
      const S = boxById.get(e.source)!, T = boxById.get(e.target)!
      const sk = `${e.source}|${sideOf(geo[i].sh)}`, tk = `${e.target}|${sideOf(geo[i].th)}`
      ;(att.get(sk) ?? att.set(sk, []).get(sk)!).push({ i, end: 's', role: 'out', sign: e.sign, chan: geo[i].chan, ox: T.cx, oy: T.cy })
      ;(att.get(tk) ?? att.set(tk, []).get(tk)!).push({ i, end: 't', role: 'in', sign: e.sign, chan: geo[i].chan, ox: S.cx, oy: S.cy })
    })
    for (const [k, list] of att) {
      const [nodeId, side] = k.split('|')
      const vert = side === 'l' || side === 'r' // боковая грань → распорка по Y, иначе по X
      // Пучок = (роль, знак, канал). Слитый веер одного знака в общем канале держит
      // один порт; вход vs выход, а также связи РАЗНОГО знака (цвета) в почти том же
      // канале — разводятся: иначе вход одной совпал бы со стартом/входом другой.
      const bmap = new Map<string, Att[]>()
      for (const a of list) {
        const bkey = `${a.role}|${a.sign}|${Math.round(a.chan / CHAN_BUCKET)}`
        ;(bmap.get(bkey) ?? bmap.set(bkey, []).get(bkey)!).push(a)
      }
      if (bmap.size < 2) continue // одна точка/пучок на грани — оставляем по центру
      const nb0 = boxById.get(nodeId)!
      const centerAxis = vert ? nb0.cy : nb0.cx
      const bundles = [...bmap.values()].map((items) => ({
        items,
        rep: items.reduce((sum, a) => sum + (vert ? a.oy : a.ox), 0) / items.length,
      }))
      bundles.sort((p, q) => p.rep - q.rep)
      const nb = bundles.length
      // «Позвоночник» — пучок, идущий почти по ПРЯМОЙ (дальний конец ≈ центр грани):
      // держим его на 0, чтобы связь шла центр→центр без изгиба, а притоки отводим ОТ
      // него. Порог = ALIGN_EPS рендера (8): при большем сдвиге ребро всё равно не будет
      // прямым. Нет прямого пучка — раскладываем симметрично вокруг центра грани.
      let spineRank = -1, bestD = 8
      bundles.forEach((b, r) => { const dd = Math.abs(b.rep - centerAxis); if (dd <= bestD) { bestD = dd; spineRank = r } })
      const half = (vert ? nb0.y1 - nb0.y0 : nb0.x1 - nb0.x0) / 2 - PORT_MARGIN
      bundles.forEach((b, r) => {
        const base = spineRank >= 0 ? r - spineRank : r - (nb - 1) / 2
        const off = Math.max(-half, Math.min(half, base * PORT_GAP))
        for (const a of b.items) { if (a.end === 's') sPort[a.i] = off; else tPort[a.i] = off }
      })
    }
    const rfEdges: Edge[] = visEdges.map((e, i) => {
      // Встречная пара A↔B (в атласе одна — SEO). Прямое ребро (по потоку) рисуем
      // прямой стрелкой; ОБРАТНОЕ (feedback, против потока) — петлёй сверху, как в
      // оригинале Miro. Так две линии не идут вплотную-параллельно.
      const mutual = edgeKeys.has(`${e.target}__${e.source}`)
      const loop = loopFlag[i]
      // Вертикальную встречную пару (петли нет) всё ещё разводим параллельным сдвигом.
      const offset = mutual && !geo[i].horiz ? (e.source < e.target ? 7 : -7) : 0
      const color = signColor(e.sign)
      // Подсветка роли смотрит на узлы, не на связи — гасим все рёбра, чтобы метрики роли читались.
      const active = activeRole ? false : (focus
        ? (chainMode ? neigh.has(e.source) && neigh.has(e.target) : e.source === focus || e.target === focus)
        : false)
      const dimmed = activeRole ? true : (focus ? !active : false)
      return {
        id: `${e.source}__${e.target}__${i}`,
        source: e.source, target: e.target, type: 'metric',
        sourceHandle: loop ? 'st' : geo[i].sh, targetHandle: loop ? 'tt' : geo[i].th,
        data: { sign: e.sign, kind: e.kind, active, dimmed, offset, lane: lane[i], loop, chan: geo[i].chan, sPort: sPort[i], tPort: tPort[i], forceInfo: forceEdgeKey === `${e.source}__${e.target}` },
        markerEnd: e.kind === 'influence'
          ? { type: MarkerType.ArrowClosed, color, width: 16, height: 16 }
          : undefined,
      }
    })
    return { rfNodes, rfEdges }
  }, [map, mode, hoverId, selNode, activeRole, forceEdgeKey])

  const selNodeObj = selNode ? nodeById(selNode) : null

  const flowRef = useRef<FlowApi | null>(null)
  // Перейти к метрике по клику на ссылку в описании: открыть карточку + центрировать.
  const focusNode = (id: string) => {
    setSelNode(id); setSelEdge(null); setActiveRole(null)
    const n = map.nodes.find((x) => x.id === id)
    if (n) flowRef.current?.setCenter(n.px + n.w / 2, n.py + n.h / 2, { zoom: 1, duration: 400 })
  }
  // Центрировать карту на метрике (без открытия карточки) — для шагов тура.
  const centerOn = (id: string) => {
    const n = map.nodes.find((x) => x.id === id)
    if (n) flowRef.current?.setCenter(n.px + n.w / 2, n.py + n.h / 2, { zoom: 1, duration: 400 })
  }
  // Центрировать на середине связи. screenUp сдвигает связь ВЫШЕ центра экрана
  // (в px при zoom=1) — чтобы её «i» не пряталась под нижней карточкой тура.
  const centerOnEdge = (e: AtlasEdge, screenUp = 0) => {
    const s = map.nodes.find((n) => n.id === e.source)
    const t = map.nodes.find((n) => n.id === e.target)
    if (s && t) flowRef.current?.setCenter(
      (s.px + s.w / 2 + t.px + t.w / 2) / 2,
      (s.py + s.h / 2 + t.py + t.h / 2) / 2 + screenUp,
      { zoom: 1, duration: 400 })
  }

  // ── Онбординг ──────────────────────────────────────────────────────────
  const markTourDone = () => { try { localStorage.setItem('jm-tour-done', '1') } catch (e) { /* приватный режим */ } }
  const closeTour = () => { setTourOn(false); setForceEdgeKey(null) ; markTourDone() }
  const startTour = () => { setForceEdgeKey(null); setTourOn(true) }
  // Первый визит: тур запускается сам (один раз, помнится через localStorage).
  useEffect(() => {
    let done = false
    try { done = localStorage.getItem('jm-tour-done') === '1' } catch (e) { done = false }
    if (done || !keyNodeId) return
    const t = setTimeout(() => setTourOn(true), 700)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const rq = (sel: string) => () => document.querySelector(sel)
  const tourSteps: TourStep[] = [
    {
      title: 'Разберём карту за минуту',
      body: <>Это карта метрик направления. Каждая карточка — один показатель, а стрелки между ними показывают, что на что влияет. Дальше — 6 коротких подсказок, как всё это читать. Закрыть можно в любой момент.</>,
      anchor: rq('[data-tour="title"]'),
      before: () => setForceEdgeKey(null),
    },
    {
      title: 'Цвет карточки = роль метрики',
      body: <>Цвет говорит, <b>что это за метрика</b>: зелёная — результат, синяя — действие (на него можно влиять), красная — затраты, жёлтая — диагностика (наблюдаем, но не крутим). Нажмите роль в легенде — на карте подсветятся все метрики этого типа.</>,
      anchor: rq('[data-tour="legend"]'),
      before: () => setForceEdgeKey(null),
      pad: 6,
    },
    {
      title: 'Ключевая метрика карты',
      body: <>Самая важная метрика раздела помечена <b>короной и надписью «Ключевая»</b>. С неё удобнее всего начинать: смотрите, какие метрики влияют на неё, а на какие влияет она сама.</>,
      anchor: () => (keyNodeId ? document.querySelector(`.react-flow__node[data-id="${CSS.escape(keyNodeId)}"]`) : null),
      before: () => { setForceEdgeKey(null); if (keyNodeId) centerOn(keyNodeId) },
    },
    {
      title: 'Стрелки — это связи, и они кликабельны',
      body: <>Стрелка — <b>влияние</b> одной метрики на другую. Цвет = знак: зелёная «+» — прямая (растёт одна, растёт и другая), красная «−» — обратная. Пунктир — связь без влияния (просто наблюдение). Наведите на связь — появится «<b>i</b>». Нажмите — объясним простыми словами, почему прямая или обратная. Важно: связи взяты из методологии карт, <b>а не посчитаны на ваших данных</b>.</>,
      anchor: () => document.querySelector('.edge-info') ?? (keyNodeId ? document.querySelector(`.react-flow__node[data-id="${CSS.escape(keyNodeId)}"]`) : null),
      before: () => { if (demoEdge) centerOnEdge(demoEdge, 0); setForceEdgeKey(demoEdgeKey) },
      pad: 14,
    },
    {
      title: 'Два вида карты',
      body: <>«<b>Основное</b>» — только каркас: результаты и то, чем можно управлять. «<b>Полностью</b>» — все связи и диагностика. Начните с «Основного», а когда захотите деталей — переключите на «Полностью».</>,
      anchor: rq('[data-tour="modes"]'),
      before: () => setForceEdgeKey(null),
    },
    {
      title: 'Поиск и повтор подсказки',
      body: <>Не видите нужную метрику — найдите её по названию через <b>поиск</b>. А кнопка «<b>?</b>» рядом откроет эти подсказки снова в любой момент.</>,
      anchor: rq('[data-tour="search"]'),
      before: () => setForceEdgeKey(null),
    },
  ]
  // Другие метрики этой карты — цели для авто-ссылок (длинные названия раньше коротких).
  const siblings = useMemo(
    () => map.nodes
      .filter((n) => n.id !== selNode)
      .map((n) => ({ name: n.name, id: n.id }))
      .sort((a, b) => b.name.length - a.name.length),
    [map, selNode],
  )

  return (
    <div className="mapscreen">
      <div className="mapcanvas">
        <ReactFlowProvider>
          <ReactFlow
            key={section}
            nodes={rfNodes}
            edges={rfEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            defaultViewport={viewport}
            minZoom={0.15}
            maxZoom={1.6}
            proOptions={{ hideAttribution: true }}
            nodesDraggable={false}
            onNodeMouseEnter={(_, n) => { if (n.type !== 'group') setHoverId(n.id) }}
            onNodeMouseLeave={(_, n) => { if (n.type !== 'group') setHoverId(null) }}
            onNodeClick={(_, n) => { if (n.type === 'group') return; setSelNode(n.id); setSelEdge(null); setActiveRole(null) }}
            onEdgeClick={(_, e) => {
              const parts = e.id.split('__')
              const found = map.edges.find((x) => x.source === parts[0] && x.target === parts[1])
              if (found) { setSelEdge(found); setSelNode(null); setActiveRole(null) }
            }}
            onPaneClick={() => { setSelNode(null); setSelEdge(null); setActiveRole(null) }}
          >
            <Background color="#C4CCD4" gap={22} size={1.6} />
            {/* Верх-лево — хлебная крошка: «Все карты» (назад в каталог) › текущая карта. */}
            <Panel position="top-left" className="crumbs">
              <button className="crumbs__back" onClick={onBack} title="Все карты" aria-label="Вернуться ко всем картам">Все карты</button>
              <span className="crumbs__sep" aria-hidden>›</span>
              <span className="crumbs__cur" data-tour="title">{section}</span>
            </Panel>
            {/* Верх-право — режим карты + утилиты (помощь · поиск). */}
            <Panel position="top-right" className="tools">
              <div className="seg" data-tour="modes">
                <button className={mode === 'spine' ? 'is-active' : ''} onClick={() => setMode('spine')}>Основное</button>
                <button className={mode === 'full' ? 'is-active' : ''} onClick={() => setMode('full')}>Полностью</button>
              </div>
              <div className="util">
                <SearchBox
                  nodes={map.nodes}
                  onPick={(id) => { setSelNode(id); setSelEdge(null) }}
                  onHelp={startTour}
                />
              </div>
            </Panel>
            <MiniMap
              pannable zoomable
              nodeColor={(n) => n.type === 'group' ? 'transparent' : roleStyle((n.data as { role: string }).role).color}
              nodeStrokeWidth={0}
              maskColor="rgba(246,248,250,.7)"
            />
            <ZoomControls home={viewport} />
            <FlowBridge apiRef={flowRef} />
          </ReactFlow>
        </ReactFlowProvider>
        <Legend
          counts={roleCounts}
          activeRole={activeRole}
          onToggleRole={(r) => { setActiveRole((p) => (p === r ? null : r)); setSelNode(null); setSelEdge(null) }}
        />
        {selNodeObj && <NodeCard node={selNodeObj} siblings={siblings} onNavigate={focusNode} onClose={() => setSelNode(null)} />}
        {selEdge && <EdgeCard edge={selEdge} onClose={() => setSelEdge(null)} onNavigate={focusNode} />}
        {tourOn && keyNodeId && <Tour steps={tourSteps} onClose={() => closeTour()} />}
      </div>
    </div>
  )
}
