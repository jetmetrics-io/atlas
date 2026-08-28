// Дерево драйверов: три ступени от фокуса — ключевая метрика, компоненты,
// драйверы. Клик по счётчику проваливает в метрику: её разбор открывается
// вторым деревом справа, первое приглушается.
//
// Раскладку считает layout.ts, данные берёт tree.ts из той же Базы, что и карты.
// Карточка метрики — общая с картами (NodeCard), поэтому дерево и карта
// описывают метрику одинаково.
import { useEffect, useMemo, useRef, useState } from 'react'
import { NodeCard } from '../map/NodeCard'
import { roleStyle } from '../atlas/style'
import { BASE, resolveMetricLink } from '../atlas/atlas'
import { metricUrl } from '../site/nav'
import { layoutTree, type TreeLayout, TREE_GAP, TREE_HEAD } from './layout'
import {
  AXES, SHORT, treeBySlug, specOf, canDrill, nodeByName, keepGroup, childTree,
  type Profile, type Tree,
} from './tree'
import type { AtlasNode } from '../atlas/types'

// «31 метрика», «32 метрики», «177 метрик» — счётчик стоит в крошках на видном месте,
// и несогласованное окончание там читается как недоделка.
const metrics = (n: number) => {
  const t = n % 10, h = n % 100
  const word = t === 1 && h !== 11 ? 'метрика'
    : t >= 2 && t <= 4 && (h < 10 || h >= 20) ? 'метрики' : 'метрик'
  return `${n} ${word}`
}

const PROFILE_KEY = 'jm-tree-profile'
// Внизу висят крошки и подсказки: без запаса последняя карточка упирается в них.
const TOP = 122, PAD = 24, BOTTOM = 76
// на узком экране профиль встаёт отдельной строкой и сдвигает всё вниз
const TOP_NARROW = 150, NARROW = 760

// Заголовки колонок — те же роли, что стоят на карточках: ступень и есть роль
// метрики в дереве.
// Колонка называется во множественном числе, роль на карточке — в единственном.
// Значок ступени рисуется контуром в цвете самой ступени: мишень у ключевой,
// плитки у компонентов, стрелка вверх у драйверов. Подписи без значка читались
// как служебная строка, а не как шапка колонок.
const TIER_ICON: Record<string, JSX.Element> = {
  key: (
    <svg viewBox="0 0 14 14" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="7" cy="7" r="5.4" /><circle cx="7" cy="7" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  ),
  component: (
    <svg viewBox="0 0 14 14" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="1.4" y="1.4" width="4.6" height="4.6" rx="1" /><rect x="8" y="1.4" width="4.6" height="4.6" rx="1" />
      <rect x="1.4" y="8" width="4.6" height="4.6" rx="1" /><rect x="8" y="8" width="4.6" height="4.6" rx="1" />
    </svg>
  ),
  driver: (
    <svg viewBox="0 0 14 14" width="13" height="13" fill="none" stroke="currentColor"
         strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.6 11.4 11.4 2.6" /><path d="M5.4 2.6h6v6" />
    </svg>
  ),
}

const TIER = [
  { key: 'key', label: 'Ключевая метрика' },
  { key: 'component', label: 'Компоненты' },
  { key: 'driver', label: 'Драйверы' },
].map((t) => ({ ...roleStyle(t.key), ...t }))

function readProfile(): Profile {
  try { return JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}') || {} } catch { return {} }
}

/** Карточка метрики на холсте дерева. У ключевой — переключатель моделей бизнеса:
 *  он разбирает именно эту метрику, поэтому и стоит на ней. */
function Card({
  n, open, onClick, models,
}: {
  n: TreeLayout['nodes'][number]
  open: boolean
  onClick: () => void
  models?: React.ReactNode
}) {
  const rs = roleStyle(n.role)
  const style = { left: n.x, top: n.y, width: n.w, height: n.h } as const
  if (n.pick) {
    return (
      <button className="tnode tnode--pick" style={style} onClick={onClick}>
        <span className="tnode__ax">{n.pick.label}</span>
        <span className="tnode__name">{n.name}</span>
        <span className="tnode__cnt">{metrics(n.pick.count)}</span>
      </button>
    )
  }
  // Карточка — не <button>: внутри неё живут кнопки моделей, а кнопка в кнопке
  // недопустима. Клавиатурой карточка всё равно доступна.
  return (
    <div
      className={`tnode${open ? ' is-open' : ''}`}
      data-tier={n.tier}
      style={style}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter') onClick() }}
    >
      <span className="tnode__meta">
        <span className="tnode__role">
          <span className="tnode__dot" style={{ background: rs.color }} />
          {rs.label}
        </span>
      </span>
      <span className="tnode__name">{n.name}</span>
      {models}
    </div>
  )
}

/** Одно дерево: связи и карточки в своей системе координат. */
function Stage({
  lay, id, openName, selName, onNode, onDrill, drillOpen, models,
}: {
  models?: React.ReactNode
  lay: TreeLayout
  id: string
  openName: string | null
  selName: string | null
  onNode: (name: string) => void
  onDrill: (name: string) => void
  drillOpen: string | null
}) {
  return (
    <div className="tstage" style={{ width: lay.w, height: lay.h }}>
      <svg className="twires" width={lay.w} height={lay.h}>
        <defs>
          {lay.markers.map((m) => (
            <marker key={`${id}${m.id}`} id={`${id}${m.id}`} markerWidth="16" markerHeight="16"
              viewBox="-10 -10 20 20" markerUnits="strokeWidth" orient="auto-start-reverse"
              refX="0" refY="0">
              <polyline points="-5,-4 0,0 -5,4 -5,-4" stroke={m.color} fill={m.color}
                strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
            </marker>
          ))}
        </defs>
        {lay.wires.map((w, i) => (
          <path key={i} d={w.d} fill="none" stroke={w.color} strokeWidth="1.6" opacity=".85"
            markerEnd={w.marker ? `url(#${id}${w.marker})` : undefined} />
        ))}
      </svg>
      {lay.nodes.map((n) => (
        <Card key={`${n.tier}-${n.name}`} n={n}
          open={openName === n.name || selName === n.name}
          models={n.tier === 0 ? models : undefined}
          onClick={() => (n.pick ? onDrill(n.name) : onNode(n.name))} />
      ))}
      {lay.chips.map((c) => (
        <button key={c.name} className={`tchip${drillOpen === c.name ? ' is-on' : ''}`}
          style={{ left: c.x + 14, top: c.cy - 13 }}
          onClick={() => onDrill(c.name)}
          aria-label={`Открыть дерево драйверов, ${c.total} метрик`}>
          <span className="tchip__s">{drillOpen === c.name ? '×' : '+'}</span>
          <span className="tchip__n">{c.total}</span>
          <span className="tchip__more">
            {drillOpen === c.name ? 'свернуть дерево' : 'открыть дерево драйверов'}
          </span>
        </button>
      ))}
      {lay.chips.map((c) => (
        <span key={`s${c.name}`} className="tstub" style={{ left: c.x, top: c.cy - 0.8 }} />
      ))}
    </div>
  )
}

export function TreeView({ slug, onBack, onOpenTree }:
  { slug: string; onBack: () => void; onOpenTree?: (slug: string, nodeId: string) => void }) {
  const tree: Tree | undefined = useMemo(() => treeBySlug(slug), [slug])
  const [profile, setProfile] = useState<Profile>(readProfile)
  const [drill, setDrill] = useState<string | null>(null)
  const [card, setCard] = useState<string | null>(null)
  // Каретка клавиатуры: имя выбранной метрики. Отдельно от открытой карточки —
  // по дереву ходят стрелками, карточку открывают пробелом.
  const [sel, setSel] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null)
  const moved = useRef(false)
  const wrap = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 1200, h: 800 })

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current
      if (!d) return
      if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 3) moved.current = true
      setPan({ x: d.px + (e.clientX - d.x), y: d.py + (e.clientY - d.y) })
    }
    const up = () => { drag.current = null }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [])

  useEffect(() => {
    const tick = () => {
      const el = wrap.current
      if (el) setBox({ w: el.clientWidth, h: el.clientHeight })
    }
    tick()
    window.addEventListener('resize', tick)
    return () => window.removeEventListener('resize', tick)
  }, [])

  // Прямая ссылка на метрику: ?tree=<slug>&node=<id>
  useEffect(() => {
    if (!tree) return
    const id = new URLSearchParams(window.location.search).get('node')
    const n = id ? tree.nodes.get(id) : undefined
    if (!n) return
    if (n.parent && n.parent !== tree.root) {
      const par = tree.nodes.get(n.parent)!
      if (par.parent && par.parent !== tree.root) setDrill(par.name)
      else if (canDrill(tree, n.parent, profile)) setDrill(par.name)
    }
    setCard(n.name)
    setSel(n.name)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree])

  // Раскладка, по которой ходит каретка: при провале это второе дерево.
  const stageRef = useRef<TreeLayout | null>(null)
  const drillRef = useRef<string | null>(null)
  const selRef = useRef<string | null>(null)
  selRef.current = sel
  drillRef.current = drill

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const lay = stageRef.current
      if (!lay) return
      if (e.key === 'Escape') { setCard(null); setDrill(null); return }
      const cur = selRef.current
      const nodes = lay.nodes.filter((n) => !n.pick || true)
      const at = nodes.find((n) => n.name === cur) ?? nodes.find((n) => n.tier === 0)!
      const step = (dir: 'up' | 'down' | 'left' | 'right') => {
        if (dir === 'up' || dir === 'down') {
          const col = nodes.filter((n) => n.tier === at.tier).sort((a, b) => a.y - b.y)
          const i = col.findIndex((n) => n.name === at.name)
          return col[Math.max(0, Math.min(col.length - 1, i + (dir === 'down' ? 1 : -1)))]
        }
        // влево — к родителю, вправо — к ближайшему по высоте ребёнку
        const tier = at.tier + (dir === 'left' ? -1 : 1)
        const col = nodes.filter((n) => n.tier === tier)
        if (!col.length) return at
        if (dir === 'left') return col.find((n) => n.name === at.parent) ?? col[0]
        const kids = col.filter((n) => n.parent === at.name)
        const pool = kids.length ? kids : col
        return pool.reduce((best, n) =>
          Math.abs(n.y - at.y) < Math.abs(best.y - at.y) ? n : best, pool[0])
      }
      const NAV: Record<string, 'up' | 'down' | 'left' | 'right'> = {
        ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
      }
      if (NAV[e.key]) {
        e.preventDefault()
        const next = step(NAV[e.key])
        setSel(next.name)
        if (card) setCard(next.name)
        return
      }
      if (e.key === ' ') { e.preventDefault(); setCard(at.name); setSel(at.name); return }
      if (e.key === 'Enter') {
        e.preventDefault()
        const chip = lay.chips.find((c) => c.name === at.name)
        if (chip) onDrillRef.current(at.name)
        else if (at.pick) onDrillRef.current(at.name)
        return
      }
      if (e.key === '0') { e.preventDefault(); setZoom(1); setPan({ x: 0, y: 0 }) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [card])

  // Провал открывает соседнее дерево: «Выручка» в дереве прибыли — драйвер,
  // а её разбор живёт отдельным артефактом, где она ключевая.
  const sub = useMemo(() => {
    if (!tree || !drill) return null
    const n = nodeByName(tree, drill)
    const info = n ? childTree(tree, n.id) : undefined
    return info ? treeBySlug(info.slug) ?? null : null
  }, [tree, drill])

  // сколько места занять под переключатель: строка чипов на каждые три модели
  const keyExtra = useMemo(() => {
    const t = sub ?? tree
    if (!t) return 0
    const gs = new Set([...t.nodes.values()].map((n) => n.group).filter(Boolean) as string[])
    const opts = AXES.flatMap((ax) => ax.opts).filter((o) => gs.has(o)).length
    return opts ? 40 * Math.ceil(opts / 2) : 0
  }, [tree, sub])

  const A = useMemo(
    () => (tree ? layoutTree(specOf(tree, tree.root, profile), 'a', false,
                             sub ? 0 : keyExtra) : null),
    [tree, profile, sub, keyExtra])

  const B = useMemo(
    () => (sub ? layoutTree(specOf(sub, sub.root, profile), 'b', true, keyExtra) : null),
    [sub, profile, keyExtra])

  const cardNode: AtlasNode | undefined = useMemo(() => {
    if (!card) return undefined
    // при провале метрика может быть и в соседнем дереве — ищем в обоих
    const n = (sub && nodeByName(sub, card)) || (tree && nodeByName(tree, card))
    return n as AtlasNode | undefined
  }, [tree, sub, card])

  // адрес метрики держим в строке браузера — им делятся и по нему возвращаются
  useEffect(() => {
    const url = new URL(window.location.href)
    if (cardNode) url.searchParams.set('node', cardNode.id)
    else url.searchParams.delete('node')
    window.history.replaceState(null, '', url.toString())
  }, [cardNode])

  // Правила геометрии связей проверяются на каждой раскладке: сдавать дерево
  // можно только с пустым списком (design/map_layout_rules.md § 9).
  useEffect(() => {
    const audit = [...(A?.audit ?? []), ...(B?.audit ?? [])]
    ;(window as unknown as { __treeAudit?: string[] }).__treeAudit = audit
    if (audit.length) console.error('НАРУШЕНИЯ РАСКЛАДКИ СВЯЗЕЙ:', audit)
  }, [A, B])

  if (!tree || !A) return null

  /** Модель добавляется к выбранным или снимается: компания может торговать
   *  и офлайн, и онлайн — тогда в дереве видны обе ветки. */
  const toggleModel = (key: string, value: string) => {
    const picked = profile[key] ?? []
    const next = { ...profile,
      [key]: picked.includes(value) ? picked.filter((v) => v !== value) : [...picked, value] }
    if (!next[key].length) delete next[key]
    setProfile(next); setPan({ x: 0, y: 0 })
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(next)) } catch { /* приватный режим */ }
  }

  const clearAxis = (key: string) => {
    const next = { ...profile }
    delete next[key]
    setProfile(next); setPan({ x: 0, y: 0 })
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(next)) } catch { /* приватный режим */ }
  }

  const onDrillRef = useRef<(name: string) => void>(() => {})
  const onDrill = (name: string) => {
    // карточка выбора модели: клик по ней задаёт профиль, а не проваливает
    const pick = A.nodes.find((n) => n.name === name)?.pick ??
      B?.nodes.find((n) => n.name === name)?.pick
    if (pick) { toggleModel(pick.axis, pick.value); return }
    setPan({ x: 0, y: 0 }); setZoom(1)
    setDrill((cur) => (cur === name ? null : name))
  }
  onDrillRef.current = onDrill
  stageRef.current = drill && B ? B : A

  // Масштаб считаем по первому дереву и при провале НЕ пересчитываем: высокое
  // дерево второго уровня ужало бы разом оба до нечитаемого.
  const top = box.w <= NARROW ? TOP_NARROW : TOP
  // Вписываем дерево в экран, но не мельче читаемого: у выручки одиннадцать
  // компонентов, и по высоте она всё равно не поместится — её листают.
  const fit = Math.max(0.78,
    Math.min(1, (box.h - top - PAD - BOTTOM) / A.h, (box.w - 2 * PAD) / A.w))
  const z = Math.max(0.25, fit * zoom)
  const cw = drill && B ? A.w + TREE_GAP + B.w : A.w
  const tx0 = drill && B
    ? Math.min(210 - A.w * z, box.w - PAD - cw * z)
    : (box.w - A.w * z) / 2
  // Границы панорамы: вверх схему не поднять выше исходного положения, вниз —
  // до нижней карточки, по горизонтали — до края схемы и не дальше.
  const ch = drill && B ? Math.max(A.h, B.h) : A.h
  const panY = Math.max(Math.min(0, box.h - PAD - BOTTOM - top - ch * z), Math.min(0, pan.y))
  const panX = Math.max(Math.min(0, box.w - PAD - tx0 - cw * z),
                        Math.min(Math.max(0, PAD - tx0), pan.x))
  const tx = tx0 + panX

  const shown = sub ?? tree
  // Полоса выбора показывает только те модели, которые встречаются в открытом
  // дереве: под налогами незачем спрашивать про канал продаж.
  const groupsHere = new Set([...shown.nodes.values()].map((n) => n.group).filter(Boolean) as string[])
  const axesHere = AXES.filter((ax) => ax.opts.some((o) => groupsHere.has(o)))
  // Переключатель моделей: живёт на карточке ключевой метрики, потому что
  // разбирает именно её. Клик по чипу не должен открывать карточку метрики.
  const models = axesHere.length ? (
    <span className="tmodels" onClick={(e) => e.stopPropagation()}>
      {axesHere.map((ax) => {
        const picked = profile[ax.key] ?? []
        return ax.opts.filter((o) => groupsHere.has(o)).map((o) => (
          <button key={o} className={picked.includes(o) ? 'is-on' : undefined}
            onClick={() => toggleModel(ax.key, o)}>{SHORT[o] ?? o}</button>
        ))
      })}
    </span>
  ) : undefined

  // Метрик в этом дереве — вместе с ключевой: у неё такая же карточка со своим
  // контентом, и не считать её странно. Размер всего разбора подписан на плашке
  // каталога; внутри дерева он только мешает — здесь видно ровно эти карточки.
  const total = [...shown.nodes.values()].filter((n) => keepGroup(n.group, profile)).length

  return (
    <div
      className="tree"
      ref={wrap}
      onPointerDown={(e) => {
        // клик по карточке, чипу или кнопке — не перетаскивание
        if ((e.target as HTMLElement).closest('.tnode, .tchip, button, select, .panel')) return
        drag.current = { x: e.clientX, y: e.clientY, px: panX, py: panY }
        moved.current = false
      }}
    >

      {/* Чип первого уровня — кнопка возврата: со второго уровня туда и целятся,
          а единственный выход раньше был на потускневшей карточке слева. */}
      <div className="tree__lvls">
        {drill
          ? <button type="button" className="tlvl tlvl--go" onClick={() => setDrill(null)}
              title="Вернуться на первый уровень"><b>1</b> уровень · {tree.info.name}</button>
          : <span className="tlvl"><b>1</b> уровень · {tree.info.name}</span>}
        {drill && <span className="tlvl tlvl--b"><b>2</b> уровень · {drill}</span>}
      </div>

      <div className="tree__heads">
        {[[A, 0, !!drill] as const,
          ...(drill && B ? [[B, A.w + TREE_GAP, false] as const] : [])].map(
          ([lay, off, dim], i) => (
            <div key={i} className={dim ? 'is-dim' : undefined}>
              {[0, 1, 2].slice(0, lay.tiers).map((t) => (
                <span key={t} className="thead" style={{
                  left: tx + (lay.cols[t] + off) * z, width: lay.w * z,
                  color: TIER[t].text, borderColor: TIER[t].color,
                }}><i className="thead__i">{TIER_ICON[TIER[t].key]}</i>{TIER[t].label}</span>
              ))}
            </div>
          ))}
      </div>

      <div
        className="tree__canvas"
        style={{ transform: `translate(${tx}px,${top + panY}px) scale(${z})` }}
      >
        <div className={`tree__a${drill ? ' is-dim' : ''}`}>
          <Stage lay={A} id="a" openName={card} selName={drill ? null : sel} drillOpen={drill}
            models={drill ? undefined : models}
            onNode={(n) => { setCard(n); setSel(n) }} onDrill={onDrill} />
        </div>
        {drill && B && (
          <div className="tree__b" style={{ left: A.w + TREE_GAP }}>
            <Stage lay={B} id="b" openName={card} selName={sel} drillOpen={null}
              models={models}
              onNode={(n) => { setCard(n); setSel(n) }} onDrill={onDrill} />
          </div>
        )}
      </div>

      <div className="tree__crumbs">
        <button onClick={onBack}>Каталог</button>
        <span>›</span>
        {drill ? <button onClick={() => setDrill(null)}>{tree.info.name}</button>
               : <b>{tree.info.name}</b>}
        {drill && <><span>›</span><b>{drill}</b></>}
        <span className="tree__count">{metrics(total)}</span>
      </div>

      {drill && (
        <button className="tree__esc" onClick={() => setDrill(null)}>
          <kbd>ESC</kbd> вернуться к дереву прибыли
        </button>
      )}

      <div className="tree__keys">
        <span><kbd>↑↓</kbd>метрики</span><i>|</i>
        <span><kbd>←→</kbd>ступени</span><i>|</i>
        <span><kbd>⏎</kbd>раскрыть</span><i>|</i>
        <span><kbd>␣</kbd>карточка</span><i>|</i>
        <span><kbd>0</kbd>вид целиком</span>
      </div>

      <div className="tree__zoom">
        <button onClick={() => setZoom((v) => Math.min(2.2, v * 1.15))} aria-label="Приблизить">+</button>
        <button onClick={() => setZoom((v) => Math.max(0.3, v / 1.15))} aria-label="Отдалить">−</button>
      </div>

      {cardNode && (
        <NodeCard
          node={cardNode}
          siblings={[]}
          onClose={() => setCard(null)}
          onNavigate={(id) => {
            // Правило ссылок: остаёмся в своём дереве, если метрика есть в нём.
            const to = resolveMetricLink(id, tree.info.name)
            const here = to?.same ? tree.nodes.get(to.id) : undefined
            // Каретку двигаем вместе с карточкой: подсветка складывается из двух
            // состояний, и если сдвинуть только карточку, обведёнными окажутся сразу
            // две метрики — та, с которой ушли, и та, куда пришли.
            if (here) { setCard(here.name); setSel(here.name); return }
            if (!to) return
            // Девять деревьев — один разбор чистой прибыли, и читатель это так и видит.
            // Поэтому переход в соседнее дерево происходит на месте, с раскрытой метрикой,
            // а не новой вкладкой: вкладка теряла и дерево, и метрику, потому что страница
            // у всех деревьев одна и открывала верхнее по умолчанию.
            const sib = (BASE.trees ?? []).find((x) => x.name === to.section)
            if (sib && onOpenTree) { onOpenTree(sib.slug, to.id); return }
            window.open(metricUrl(to.section, to.id), '_blank', 'noopener')
          }}
        />
      )}
    </div>
  )
}

/** Есть ли в Базе дерево с таким адресом. */
export function treeExists(slug: string): boolean {
  return (BASE.trees ?? []).some((t) => t.slug === slug)
}
