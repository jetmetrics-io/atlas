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
  AXES, SHORT, treeBySlug, specOf, canDrill, nodeByName, keepGroup, childTree, withDefaults,
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
// Ширина карточки метрики (.panel в index.css): на неё резервируем место справа.
const PANEL_W = 420
// «Вопросы дерева» — список справа, на месте карточки метрики (Дмитрий 25.09.2026).
// Список на полоску шире карточки: из-под открытой карточки слева торчит «Вопросы».
const STRIP = 28, QS_W = PANEL_W + STRIP
const QS_KEY = 'jm-tree-questions'
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

/** Галочка «Вопросы дерева», если её трогали. Не трогали — null: тогда список
 *  включён, когда дереву остаётся не меньше 600 px. */
function readQs(): boolean | null {
  try { const s = localStorage.getItem(QS_KEY); return s === null ? null : s === '1' } catch { return null }
}

/** Карточка метрики на холсте дерева. У ключевой — переключатель моделей бизнеса:
 *  он разбирает именно эту метрику, поэтому и стоит на ней. */
function Card({
  n, open, hl, onClick, onHover, models,
}: {
  n: TreeLayout['nodes'][number]
  open: boolean
  /** навели на строку в «Вопросах дерева» — карточка подсвечена */
  hl?: boolean
  onClick: () => void
  onHover?: (on: boolean) => void
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
      className={`tnode${open ? ' is-open' : ''}${hl ? ' is-hl' : ''}`}
      data-tier={n.tier}
      style={style}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter') onClick() }}
      onMouseEnter={onHover && (() => onHover(true))}
      onMouseLeave={onHover && (() => onHover(false))}
    >
      <span className="tnode__meta">
        <span className="tnode__role">
          <span className="tnode__dot" style={{ background: rs.color }} />
          {rs.label}
        </span>
      </span>
      <span className="tnode__name">{n.name}</span>
      <Srez label={n.label} />
      {models}
    </div>
  )
}

/** Срез метрики: отдельная строка под именем — «показана не вся метрика,
 *  а одно значение разреза». Значок и подпись ставятся только вместе:
 *  значок без подписи пропадает в печати, подпись без значка читается
 *  как часть названия (решение Дмитрия 16.09.2026, вариант 04). */
function Srez({ label }: { label?: string }) {
  if (!label) return null
  return (
    <span className="tnode__srez" title={label}>
      <svg viewBox="0 0 16 16" width="11" height="11" fill="currentColor" aria-hidden="true">
        <path d="M1.5 2.2h13a.6.6 0 0 1 .46 1L10 9.1V14a.6.6 0 0 1-.9.52l-2.4-1.4a.6.6 0 0 1-.3-.52V9.1L1.04 3.2a.6.6 0 0 1 .46-1z" />
      </svg>
      <span>{label}</span>
    </span>
  )
}

/** Одно дерево: связи и карточки в своей системе координат. */
function Stage({
  lay, id, openName, selName, onNode, onDrill, drillOpen, models, hlName, onHover,
}: {
  models?: React.ReactNode
  lay: TreeLayout
  id: string
  openName: string | null
  selName: string | null
  onNode: (name: string) => void
  onDrill: (name: string) => void
  drillOpen: string | null
  hlName?: string | null
  onHover?: (name: string | null) => void
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
          hl={hlName === n.name}
          onHover={onHover && ((on) => onHover(on ? n.name : null))}
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

export function TreeView({ slug, onBack, initialDrill }:
  { slug: string; onBack: () => void; initialDrill?: string | null }) {
  const tree: Tree | undefined = useMemo(() => treeBySlug(slug), [slug])
  const [profile, setProfile] = useState<Profile>(readProfile)
  // профиль, по которому рисуем: у осей с одиночным выбором модель есть всегда
  const eff = useMemo(() => withDefaults(profile), [profile])
  const [drill, setDrill] = useState<string | null>(null)
  // Метрику из адреса запоминаем при первом рендере: App синхронизирует адрес
  // и стирает ?node= раньше, чем эффекты успевают его прочитать.
  const wantNode = useRef(new URLSearchParams(window.location.search).get('node'))
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
  // «Вопросы дерева»: выбор человека (null — не трогал) и подсветка по наведению.
  // Навели на строку — подсвечена карточка на холсте, навели на карточку — строка.
  const [qsPref, setQsPref] = useState<boolean | null>(readQs)
  const [hl, setHl] = useState<{ name: string; from: 'list' | 'tree' } | null>(null)
  const qbody = useRef<HTMLDivElement>(null)

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

  // Провал, заданный адресом: `?tree=<подчинённое>` открывает родителя с провалом
  // внутрь. Ставим до разбора ?node=, иначе метрика подчинённого дерева не найдётся.
  useEffect(() => {
    if (!tree || !initialDrill) return
    if (nodeByName(tree, initialDrill)) setDrill(initialDrill)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree, initialDrill])

  // Прямая ссылка на метрику: ?tree=<slug>&node=<id>
  useEffect(() => {
    if (!tree) return
    const id = wantNode.current
    const n = id ? tree.nodes.get(id) : undefined
    if (!n) return
    // Проваливаемся, только если у родителя ЕСТЬ отдельное дерево второго уровня.
    // canDrill() отвечает лишь «есть ли дети», а у компонента плоского дерева дети —
    // это его же драйверы: по прямой ссылке на драйвер весь холст гас и в крошках
    // появлялся второй уровень, которого нет (Dmitry 11.09.2026).
    if (n.parent && n.parent !== tree.root) {
      const par = tree.nodes.get(n.parent)!
      if (par.parent && par.parent !== tree.root) setDrill(par.name)
      else if (childTree(tree, n.parent) && canDrill(tree, n.parent, eff)) setDrill(par.name)
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

  // Метрика из ?node= может жить не в дереве-родителе, а в том, куда провалились:
  // ссылка вида `?tree=sebestoimost-prodazh&node=sebestoimost-prodazh/...` открывает
  // прибыль с провалом в себестоимость, и карточку надо искать уже там.
  useEffect(() => {
    if (!sub || card) return
    const id = wantNode.current
    const n = id ? sub.nodes.get(id) : undefined
    if (n) { setCard(n.name); setSel(n.name) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sub])

  // сколько места занять под переключатель: строка чипов на каждые три модели
  const keyExtra = useMemo(() => {
    const t = sub ?? tree
    if (!t) return 0
    const gs = new Set([...t.nodes.values()].map((n) => n.group).filter(Boolean) as string[])
    const opts = AXES.flatMap((ax) => ax.opts).filter((o) => gs.has(o)).length
    // «подписка» и «разовые покупки» в одну строку карточки не входят: вторая строка
    // вытесняла имя метрики. Для оси с одиночным выбором строки считаем по длине подписей.
    if (AXES.some((ax) => ax.single && ax.opts.some((o) => gs.has(o)))) {
      const labels = AXES.flatMap((ax) => ax.opts).filter((o) => gs.has(o)).map((o) => SHORT[o] ?? o)
      let rows = 1, used = 0
      labels.forEach((l) => {
        const w = 28 + 8.3 * l.length
        if (used && used + 7 + w > 227) { rows++; used = w } else used += (used ? 7 : 0) + w
      })
      return 40 * rows
    }
    return opts ? 40 * Math.ceil(opts / 2) : 0
  }, [tree, sub])

  const A = useMemo(
    () => (tree ? layoutTree(specOf(tree, tree.root, eff), 'a', tree.info.slug === 'ltv',
                             sub ? 0 : keyExtra) : null),
    [tree, eff, sub, keyExtra])

  const B = useMemo(
    () => (sub ? layoutTree(specOf(sub, sub.root, eff), 'b', true, keyExtra) : null),
    [sub, eff, keyExtra])

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

  // Список вопросов есть только у дерева, где вопросы узлов лежат в Базе.
  const hasQs = useMemo(() => {
    const t = sub ?? tree
    return !!t && [...t.nodes.values()].some((n) => n.question)
  }, [tree, sub])
  const qsOn = hasQs && (qsPref ?? box.w - QS_W >= 600)

  // Выбрали метрику на холсте или стрелками — список подводится к её строке.
  // Прокручиваем только список: scrollIntoView прокрутил бы и страницу.
  const focusName = card ?? sel
  useEffect(() => {
    const body = qbody.current
    if (!body || !focusName) return
    const r = [...body.querySelectorAll<HTMLElement>('.qrow')].find((x) => x.dataset.name === focusName)
    if (!r) return
    const br = body.getBoundingClientRect(), rr = r.getBoundingClientRect()
    if (rr.top < br.top + 8) body.scrollTop -= br.top + 8 - rr.top
    else if (rr.bottom > br.bottom - 8) body.scrollTop += rr.bottom - (br.bottom - 8)
  }, [focusName, qsOn])

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
    const single = AXES.find((a) => a.key === key)?.single
    const next = { ...profile,
      [key]: single ? [value]
        : picked.includes(value) ? picked.filter((v) => v !== value) : [...picked, value] }
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
  // Дерево БЕЗ ПРОВАЛОВ: ни у одной его метрики нет своего разбора. Тогда незачем
  // и чип «1 уровень» (второго не будет), и «⏎ раскрыть» в подсказке — нажимать
  // нечего. А место справа держим под карточку метрики: такое дерево влезает в
  // экран целиком, панорамировать его некуда, и панель накрывает правую колонку —
  // те самые драйверы, ради которых карточку и открыли (Dmitry 11.09.2026).
  const flat = !(BASE.trees ?? []).some((t) => t.parent === tree.info.slug)
  // с «Вопросами дерева» справа держим место под список — он на полоску шире карточки
  const reserve = qsOn ? QS_W : PANEL_W
  const useW = flat && box.w - reserve >= 600 ? box.w - reserve : box.w
  // Вписываем дерево в экран, но не мельче читаемого: у выручки одиннадцать
  // компонентов, и по высоте она всё равно не поместится — её листают.
  const fit = Math.max(0.78,
    Math.min(1, (box.h - top - PAD - BOTTOM) / A.h, (useW - 2 * PAD) / A.w))
  const z = Math.max(0.25, fit * zoom)
  const cw = drill && B ? A.w + TREE_GAP + B.w : A.w
  // При провале второе дерево начинается правее чипов уровней: иначе подпись
  // «Ключевая метрика» в приклеенной шапке уходит под плашку «2 уровень».
  // 500 — правый край самого длинного чипа плюс зазор.
  // При провале второе дерево всегда начинается на одном и том же месте — сразу
  // правее чипов уровней. Не прижимаем ни к правому краю, ни к левому: от прижатия
  // положение прыгало от ширины экрана, и подпись «Ключевая метрика» то уезжала
  // под плашку «2 уровень», то улетала к правому краю. Смещение первой колонки
  // (B.cols[0]) входит в расчёт: колонка начинается не в нуле раскладки.
  const DRILL_LEFT = 496
  const tx0 = drill && B
    ? DRILL_LEFT - (A.w + TREE_GAP + B.cols[0]) * z
    : (useW - A.w * z) / 2
  // Границы панорамы: вверх схему не поднять выше исходного положения, вниз —
  // до нижней карточки, по горизонтали — до края схемы и не дальше.
  const ch = drill && B ? Math.max(A.h, B.h) : A.h
  const panY = Math.max(Math.min(0, box.h - PAD - BOTTOM - top - ch * z), Math.min(0, pan.y))
  const panX = Math.max(Math.min(0, useW - PAD - tx0 - cw * z),
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
        const picked = eff[ax.key] ?? []
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
  const total = [...shown.nodes.values()].filter((n) => keepGroup(n.group, eff)).length

  // ── Вопросы дерева ──────────────────────────────────────────────────────────
  // Лесенка в порядке холста: ключевая, под ней компоненты сверху вниз, под каждым
  // его драйверы. Строка — вопрос дерева у этого места; вопроса нет — имя метрики.
  const L = drill && B ? B : A
  const byY = (a: { y: number }, b: { y: number }) => a.y - b.y
  const qOf = (name: string) => {
    const n = nodeByName(shown, name)
    return n?.question || name
  }
  // Щелчок по строке открывает карточку и подводит холст к метрике, если она за краем
  const reveal = (name: string) => {
    const n = L.nodes.find((x) => x.name === name)
    if (!n) return
    const off = drill && B ? A.w + TREE_GAP : 0
    const y = top + panY + n.y * z, x = tx + (off + n.x) * z
    let dx = 0, dy = 0
    if (y < top) dy = top - y
    else if (y + n.h * z > box.h - BOTTOM) dy = box.h - BOTTOM - (y + n.h * z)
    if (x < PAD) dx = PAD - x
    else if (x + n.w * z > useW - PAD) dx = useW - PAD - (x + n.w * z)
    if (dx || dy) setPan({ x: panX + dx, y: panY + dy })
  }
  const qrow = (n: TreeLayout['nodes'][number]) => (
    <button key={`${n.tier}-${n.name}`} type="button" data-tier={n.tier} data-name={n.name}
      className={`qrow${card === n.name || sel === n.name ? ' is-on' : ''}${
        hl?.from === 'tree' && hl.name === n.name ? ' is-hl' : ''}`}
      onClick={() => { setCard(n.name); setSel(n.name); reveal(n.name) }}
      onMouseEnter={() => setHl({ name: n.name, from: 'list' })}
      onMouseLeave={() => setHl(null)}>
      <span className="tnode__dot" style={{ background: roleStyle(n.role).color }} />
      <span>{qOf(n.name)}</span>
    </button>
  )
  const qRoot = L.nodes.find((n) => n.tier === 0)
  const qModel = axesHere.flatMap((ax) => (eff[ax.key] ?? []).filter((o) => groupsHere.has(o)))
    .map((o) => SHORT[o] ?? o).join(', ')
  const toggleQs = (on: boolean) => {
    setQsPref(on); setPan({ x: 0, y: 0 })
    try { localStorage.setItem(QS_KEY, on ? '1' : '0') } catch { /* приватный режим */ }
  }
  const hoverCard = qsOn ? (name: string | null) => setHl(name ? { name, from: 'tree' } : null) : undefined
  const hlCard = hl?.from === 'list' ? hl.name : null

  const crumbs = (
    <div className="tree__crumbs">
      <button onClick={onBack}>Каталог</button>
      <span>›</span>
      {drill ? <button onClick={() => setDrill(null)}>{tree.info.name}</button>
             : <b>{tree.info.name}</b>}
      {drill && <><span>›</span><b>{drill}</b></>}
      <span className="tree__count">{metrics(total)}</span>
    </div>
  )

  return (
    <div
      className={`tree${cardNode ? ' has-panel' : ''}${qsOn ? ' has-qs' : ''}`}
      ref={wrap}
      onPointerDown={(e) => {
        // клик по карточке, чипу или кнопке — не перетаскивание
        if ((e.target as HTMLElement).closest('.tnode, .tchip, button, select, label, .panel, .qpanel')) return
        drag.current = { x: e.clientX, y: e.clientY, px: panX, py: panY }
        moved.current = false
      }}
    >

      {/* Чип первого уровня — кнопка возврата: со второго уровня туда и целятся,
          а единственный выход раньше был на потускневшей карточке слева. */}
      {!flat && <div className="tree__lvls">
        {drill
          ? <button type="button" className="tlvl tlvl--go" onClick={() => setDrill(null)}
              title="Вернуться на первый уровень"><b>1</b> уровень · {tree.info.name}</button>
          : <span className="tlvl"><b>1</b> уровень · {tree.info.name}</span>}
        {drill && <span className="tlvl tlvl--b"><b>2</b> уровень · {drill}</span>}
      </div>}

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
            hlName={drill ? null : hlCard} onHover={drill ? undefined : hoverCard}
            onNode={(n) => { setCard(n); setSel(n) }} onDrill={onDrill} />
        </div>
        {drill && B && (
          <div className="tree__b" style={{ left: A.w + TREE_GAP }}>
            <Stage lay={B} id="b" openName={card} selName={sel} drillOpen={null}
              models={models} hlName={hlCard} onHover={hoverCard}
              onNode={(n) => { setCard(n); setSel(n) }} onDrill={onDrill} />
          </div>
        )}
      </div>

      {/* «Вопросы дерева» пристыкованы справа к крошкам (Дмитрий 25.09.2026) */}
      {hasQs ? (
        <div className="ttop">
          {crumbs}
          <label className="qtoggle">
            <input type="checkbox" checked={qsOn} onChange={(e) => toggleQs(e.target.checked)} />
            Вопросы дерева
          </label>
        </div>
      ) : crumbs}

      {drill && (
        <button className="tree__esc" onClick={() => setDrill(null)}>
          <kbd>ESC</kbd> вернуться к дереву прибыли
        </button>
      )}

      <div className="tree__keys">
        <span><kbd>↑↓</kbd>метрики</span><i>|</i>
        <span><kbd>←→</kbd>ступени</span><i>|</i>
        {!flat && <><span><kbd>⏎</kbd>раскрыть</span><i>|</i></>}
        <span><kbd>␣</kbd>карточка</span><i>|</i>
        <span><kbd>0</kbd>вид целиком</span>
      </div>

      <div className="tree__zoom">
        <button onClick={() => setZoom((v) => Math.min(2.2, v * 1.15))} aria-label="Приблизить">+</button>
        <button onClick={() => setZoom((v) => Math.max(0.3, v / 1.15))} aria-label="Отдалить">−</button>
      </div>

      {qsOn && qRoot && (
        <aside className="qpanel" aria-label="Вопросы дерева">
          {/* из-под открытой карточки торчит полоска: щелчок закрывает карточку */}
          <button type="button" className="qpanel__strip" onClick={() => setCard(null)}
            title="Закрыть карточку и вернуться к вопросам"><span>Вопросы</span></button>
          <div className="qpanel__head">
            <span className="panel__label">Вопросы дерева</span>
            <span className="qpanel__model">{qModel}</span>
            <button type="button" className="panel__close" onClick={() => toggleQs(false)}
              aria-label="Скрыть вопросы">×</button>
          </div>
          <div className="qpanel__body" ref={qbody}>
            {qrow(qRoot)}
            <div className="qkids qkids--root">
              {L.nodes.filter((n) => n.tier === 1 && !n.pick).sort(byY).map((c) => {
                const kids = L.nodes.filter((d) => d.tier === 2 && d.parent === c.name).sort(byY)
                return (
                  <div key={c.name} className="qbranch">
                    {qrow(c)}
                    {kids.length > 0 && <div className="qkids">{kids.map(qrow)}</div>}
                  </div>
                )
              })}
            </div>
          </div>
        </aside>
      )}

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
            window.open(metricUrl(to.section, to.id), '_blank', 'noopener')
          }}
        />
      )}
    </div>
  )
}

/** Есть ли в Базе дерево с таким адресом и загружены ли его метрики. Одной записи
 *  в `trees` мало: у платного дерева она есть и в бесплатной сборке, а узлов там нет —
 *  открывать такое нельзя, читатель без оплаты остаётся в каталоге (как с платной картой). */
export function treeExists(slug: string): boolean {
  return !!treeBySlug(slug)
}
