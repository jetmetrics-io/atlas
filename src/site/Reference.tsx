// Справочник метрик — вид главной Атласа рядом с каталогом карт и деревьев.
//
// Единица здесь — метрика, а не место: строка на метрику, у неё чипы всех карт
// и деревьев, где она стоит. Решения — Мария, 29.09.2026; макет и журнал решений —
// work/джетметрикс/metrics-reference/public_reference_plan.md (у Марии).
//
// - Неоплативший видит все метрики: определение и формула открыты. Чипы платных
//   карт и деревьев — с замком, клик открывает окно «в полной версии».
// - Фильтры одной строкой: карта или дерево (направление — группой внутри), единица.
//   Суть в таблице и фильтрах не показываем, она есть в карточке (Мария 30.09).
// - Клик по метрике — карточка справа, та же, что на картах. У метрики только из
//   платных артефактов неоплатившему — лишь то, что видно в таблице.
// - Чип «Где стоит» открывает метрику в её карте или дереве новой вкладкой.
import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react'
import { BASE, PAID, families, isSectionUnlocked } from '../atlas/atlas'
import { refMetrics, refReady, onRefReady, midOfNode, refByMid, type RefMetric, type RefPlace } from '../atlas/reference'
import type { AtlasNode } from '../atlas/types'
import { NodeCard } from '../map/NodeCard'
import { EMBED, openPlaceInNewTab } from './nav'
import { openLockDialog } from './LockDialog'

const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim()
// Разметка хранения в таблице не нужна: [[текст→адрес]] → текст, **жирный** → текст.
const plain = (s?: string) => (s ?? '').replace(/\[\[([^\]→]+)→[^\]]*\]\]/g, '$1').replace(/\*\*/g, '').replace(/<br>\s*/g, ' ')
// По первой букве: «% возвратов» стоит среди «В», а не в начале списка.
const sortKey = (name: string) => name.toLowerCase().replace(/^[^0-9a-zа-яё]+/i, '')

const UNITS = ['Количество', '%', 'Деньги', 'Время']

// Направление отдельным фильтром не заводим: оно — группа в списке «Карта или дерево»,
// и выбирается там целиком, галочкой на заголовке группы (решение Марии 30.09).
type Key = 'art' | 'unit'
type Filters = Record<Key, Set<string>>
const emptyFilters = (): Filters => ({ art: new Set(), unit: new Set() })

function plural(n: number, one: string, few: string, many: string) {
  const form = n % 10 === 1 && n % 100 !== 11 ? one
    : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many
  return `${n} ${form}`
}

const Icon = {
  map: <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="1.5" y="2.5" width="13" height="11" rx="2" /><path d="M5.5 2.5v11M10.5 2.5v11" /></svg>,
  tree: <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="8" cy="3" r="1.8" /><circle cx="3.5" cy="13" r="1.8" /><circle cx="12.5" cy="13" r="1.8" /><path d="M8 4.8V8M8 8H3.5v3.2M8 8h4.5v3.2" /></svg>,
  lock: <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>,
  down: <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m3.5 6 4.5 4.5L12.5 6" /></svg>,
}

/** Место метрики чипом: открытое — новой вкладкой в свою карту, закрытое — окно «в полной версии». */
function PlaceChip({ p }: { p: RefPlace }) {
  const locked = !isSectionUnlocked(p.a)
  return (
    <button type="button" className={`rchip${locked ? ' is-locked' : ''}`}
      onClick={(e) => { e.stopPropagation(); if (locked) openLockDialog(); else openPlaceInNewTab(p.a, p.node) }}>
      {locked ? Icon.lock : p.type === 'tree' ? Icon.tree : Icon.map}<span>{p.a}</span>
    </button>
  )
}

/** Узел для карточки: справочник открывает метрику, а карточке нужен узел — берём место,
 *  которое читателю открыто (у него есть контент), иначе первое. */
function nodeFor(m: RefMetric): AtlasNode {
  const p = m.places.find((x) => isSectionUnlocked(x.a)) ?? m.places[0]
  // У метрики без места вместо узла — её адрес в справочнике (spravochnik/<slug>).
  if (!p) return { id: m.node ?? `spravochnik/${m.mid}`, mid: m.mid, name: m.name, section: '', role: '',
    x: 0, y: 0, w: 0, h: 0, cx: 0, cy: 0,
    formula: m.formula ?? '', description: m.desc ?? '', units: m.unit ?? '' }
  return { id: p.node, mid: m.mid, name: m.name, section: p.a, role: p.role,
    x: 0, y: 0, w: 0, h: 0, cx: 0, cy: 0,
    formula: m.formula ?? '', description: m.desc ?? '', units: m.unit ?? '' }
}

export function Reference({ tq, setTq, openMid, setOpenMid }: {
  /** Фильтр по названию метрики — поле в шапке столбца «Метрика». */
  tq: string
  setTq: (q: string) => void
  openMid: number | null
  setOpenMid: (mid: number | null) => void
}) {
  const [, force] = useState(0)
  useEffect(() => onRefReady(() => force((n) => n + 1)), [])
  const [F, setF] = useState<Filters>(emptyFilters)
  const [pop, setPop] = useState<Key | null>(null)
  const [popQ, setPopQ] = useState('')
  // На странице Тильды iframe растёт под содержимое, и «прилипнуть» к экрану карточка
  // не может — ставим её рядом со строкой, по которой нажали.
  const [anchor, setAnchor] = useState<number | null>(null)
  const root = useRef<HTMLDivElement>(null)

  const fams = families()
  // Карты и деревья для фильтра — по направлениям; подчинённые деревья разбора прибыли
  // подписаны своим верхним деревом.
  const parentName = useMemo(() => {
    const trees = BASE.trees ?? []
    return (name: string) => {
      const t = trees.find((x) => x.name === name)
      return t?.parent ? trees.find((x) => x.slug === t.parent)?.name : undefined
    }
  }, [])

  const all = useMemo(() => [...refMetrics()].sort((a, b) => sortKey(a.name).localeCompare(sortKey(b.name), 'ru')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [refReady()])

  const qn = norm(tq)
  // Фильтр столбца — строго по названию метрики, без синонимов и английского имени
  // (решение Марии 29.09): иначе «сред» находит «Амортизацию» по «износу основных средств».
  const matchQ = (m: RefMetric) => !qn || norm(m.name).includes(qn)
  // skip — фильтр, который не учитываем: так считаются числа у значений этого же фильтра
  const passes = (m: RefMetric, skip?: Key) =>
    (skip === 'art' || !F.art.size || m.places.some((p) => F.art.has(p.a)))
    && (skip === 'unit' || !F.unit.size || F.unit.has(m.unit ?? ''))
    && matchQ(m)
  const rows = all.filter((m) => passes(m))
  const count = (skip: Key, test: (m: RefMetric) => boolean) => all.reduce((n, m) => n + (passes(m, skip) && test(m) ? 1 : 0), 0)
  const anyF = F.art.size + F.unit.size > 0

  const toggle = (k: Key, v: string) => setF((f) => {
    const s = new Set(f[k]); if (s.has(v)) s.delete(v); else s.add(v)
    return { ...f, [k]: s }
  })
  // Направление целиком: выбраны все его карты и деревья — снять все, иначе — выбрать все.
  const famNames = (key: string) => fams.find((f) => f.key === key)?.items.map((it) => it.name) ?? []
  const famState = (key: string): boolean | 'mixed' => {
    const names = famNames(key)
    const n = names.filter((x) => F.art.has(x)).length
    return n === 0 ? false : n === names.length ? true : 'mixed'
  }
  const toggleFam = (key: string) => setF((f) => {
    const s = new Set(f.art)
    const names = famNames(key)
    if (names.every((x) => s.has(x))) names.forEach((x) => s.delete(x)); else names.forEach((x) => s.add(x))
    return { ...f, art: s }
  })

  // Клик мимо списка фильтра — закрыть.
  useEffect(() => {
    if (!pop) return
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (!t.closest('.rfilter')) { setPop(null); setPopQ('') }
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setPop(null); setPopQ('') } }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [pop])

  const label = (k: Key, name: string) => {
    const s = F[k]
    if (!s.size) return name
    // выбрано ровно одно направление целиком — пишем его название
    if (k === 'art') {
      const whole = fams.filter((f) => famState(f.key) === true)
      if (whole.length === 1 && famNames(whole[0].key).length === s.size) return `${name}: ${whole[0].title}`
    }
    const one = [...s][0]
    return s.size === 1 ? `${name}: ${one}` : `${name} · ${s.size}`
  }

  const opt = (k: Key, v: string, text: React.ReactNode, n: number, sub = false) => (
    <button key={v} type="button" className={`ropt${sub ? ' is-sub' : ''}${n ? '' : ' is-zero'}`}
      aria-checked={F[k].has(v)} role="menuitemcheckbox" onClick={() => toggle(k, v)}>
      <span className="ropt__cb" /><span className="ropt__l">{text}</span><span className="ropt__n">{n}</span>
    </button>
  )

  const popList = (k: Key) => {
    if (k === 'unit') return UNITS.map((u) => opt('unit', u, u, count('unit', (m) => m.unit === u)))
    const pq = norm(popQ)
    const groups = fams.map((f) => {
      const items = f.items.filter((it) => !pq || norm(it.name).includes(pq))
      if (!items.length) return null
      return (
        <div key={f.key}>
          <button type="button" className={`ropt is-grp${count('art', (m) => m.places.some((p) => p.fam === f.key)) ? '' : ' is-zero'}`}
            role="menuitemcheckbox" aria-checked={famState(f.key)} onClick={() => toggleFam(f.key)}>
            <span className="ropt__cb" /><span className="ropt__l">{f.title}</span>
            <span className="ropt__n">{count('art', (m) => m.places.some((p) => p.fam === f.key))}</span>
          </button>
          {items.map((it) => opt('art', it.name, <>
            {!isSectionUnlocked(it.name) ? Icon.lock : it.type === 'tree' ? Icon.tree : Icon.map}
            <span>{it.name}</span>{parentName(it.name) && <span className="ropt__par">{parentName(it.name)}</span>}
          </>, count('art', (m) => m.places.some((p) => p.a === it.name)), true))}
        </div>
      )
    })
    return groups.some(Boolean) ? groups : <div className="ropt__empty">Ничего не нашлось</div>
  }

  const fbtn = (k: Key, name: string) => (
    <span className="rfilter">
      <button type="button" className={`rfbtn${F[k].size ? ' is-on' : ''}`} aria-expanded={pop === k}
        onClick={() => { setPop(pop === k ? null : k); setPopQ('') }}>
        {label(k, name)}{Icon.down}
      </button>
      {pop === k && (
        <div className={`rpop${k === 'art' ? ' rpop--wide' : ''}`} role="menu">
          {k === 'art' && (
            <input className="rpop__q" autoFocus value={popQ} onChange={(e) => setPopQ(e.target.value)}
              placeholder="Найти карту или дерево" aria-label="Найти карту или дерево" />
          )}
          <div className="rpop__list">{popList(k)}</div>
        </div>
      )}
    </span>
  )

  const open = (mid: number, rowEl?: HTMLElement | null) => {
    if (EMBED && root.current) {
      const top = rowEl ? rowEl.getBoundingClientRect().top - root.current.getBoundingClientRect().top : 0
      setAnchor(Math.max(0, top - 120))
    } else setAnchor(null)
    setOpenMid(mid)
  }
  const openMetric = openMid != null ? refByMid(openMid) : undefined
  const panelStyle: CSSProperties | undefined = EMBED ? { top: anchor ?? 0 } : undefined

  if (!refReady()) return <div className="rempty">Загружаем справочник…</div>

  return (
    <div className="ref" ref={root}>
      <div className="rbar">
        {fbtn('art', 'Карта или дерево')}
        {fbtn('unit', 'Единица')}
        <span className="rbar__end">
          <span className="rbar__n">{anyF || qn ? `Нашлось ${rows.length} из ${all.length}` : plural(all.length, 'метрика', 'метрики', 'метрик')}</span>
          {(anyF || qn) && <button type="button" className="rbar__reset" onClick={() => { setF(emptyFilters()); setTq('') }}>Сбросить</button>}
        </span>
      </div>

      <div className="rtable-wrap">
        <table className="rtable">
          <thead><tr>
            <th>
              <div className="rth-q">
                {/* заголовок столбца сам и есть поле поиска: «Метрика…» (решение Марии 29.09) */}
                <label className="rth-q__f">
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>
                  <input value={tq} onChange={(e) => setTq(e.target.value)} placeholder="Метрика…"
                    aria-label="Найти метрику в таблице по названию" />
                  {tq && <button type="button" onClick={() => setTq('')} aria-label="Очистить">×</button>}
                </label>
              </div>
            </th>
            <th>Формула</th><th>Ед.</th><th>Где стоит</th>
          </tr></thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.mid} className={openMid === m.mid ? 'is-on' : undefined}
                onClick={(e) => open(m.mid, e.currentTarget)}>
                <td className="rtable__m">
                  <a className="rtable__nm" href={`?view=metrics&metric=${m.mid}`}
                    onClick={(e) => { e.preventDefault() }}>{m.name}</a>
                  {m.desc && <div className="rtable__ds">{plain(m.desc)}</div>}
                </td>
                <td className="rtable__f">{plain(m.formula)}</td>
                <td><span className="rtable__u">{m.unit}</span></td>
                <td><div className="rtable__w">{m.places.length
                  ? m.places.map((p) => <PlaceChip key={p.node} p={p} />)
                  : <span className="rtable__none">пока ни на одной карте</span>}</div></td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={4} className="rempty">Ничего не нашлось</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {openMetric && (
        <NodeCard
          node={nodeFor(openMetric)}
          siblings={[]}
          mode="ref"
          // метрика без места не стоит ни в одном бесплатном артефакте: полная — только купившему
          locked={openMetric.places.length ? !openMetric.places.some((p) => isSectionUnlocked(p.a)) : !PAID}
          className={EMBED ? 'panel--ref panel--ref-embed' : 'panel--ref'}
          style={panelStyle}
          // ссылка на соседнюю метрику в тексте карточки открывает её карточку здесь же
          onNavigate={(nodeId) => { const mid = midOfNode(nodeId); if (mid != null) setOpenMid(mid) }}
          onClose={() => setOpenMid(null)}
        />
      )}
    </div>
  )
}
