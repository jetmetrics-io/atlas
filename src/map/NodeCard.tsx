import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from 'react'
import { trackMetric } from '../site/analytics'
import type { AtlasNode } from '../atlas/types'
import { roleStyle, ROLE_DEFAULT } from '../atlas/style'
import { treeOfMetric, BASE, isSectionUnlocked } from '../atlas/atlas'
import { metricContent, contentReady, onContentReady } from '../atlas/content'
import { metricQuestions, loadQuestions, questionsReady, onQuestionsReady } from '../atlas/questions'
import { refByMid, onRefReady, midOfNode, isRefOnly, refMetrics, refReady, type RefPlace } from '../atlas/reference'
import { metricDossier } from '../atlas/dossier'
import { EMBED, metricUrl, openTree, refUrl, openPlaceInNewTab } from '../site/nav'
import { copyText } from '../site/clipboard'
import { openLockDialog } from '../site/LockDialog'

export type LinkTarget = { name: string; id: string }

const isWord = (c?: string) => !!c && /[\p{L}\p{N}]/u.test(c)

// Найти в тексте упоминания других метрик карты и сделать их кликабельными.
// targets должны идти от длинных названий к коротким (жадный матч по длине).
// Явная ссылка на метрику: [[текст, как он стоит в предложении→id метрики]].
// Нужна там, где метрика упомянута не своим именем — в косвенном падеже,
// сокращённо или описательно, и автоматический linkify её не находит.
// Разделитель — стрелка, а не вертикальная черта: контент хранится в MD-таблице,
// где «|» разрезает ячейку.
const EXPLICIT = /\[\[([^\]→]+)→([^\]]+)\]\]/g

function withExplicit(text: string, targets: LinkTarget[], onNav: (id: string) => void): ReactNode[] {
  if (!text.includes('[[')) return linkify(text, targets, onNav)
  const out: ReactNode[] = []
  let i = 0
  let k = 0
  let m: RegExpExecArray | null
  EXPLICIT.lastIndex = 0
  while ((m = EXPLICIT.exec(text))) {
    if (m.index > i) out.push(...linkify(text.slice(i, m.index), targets, onNav))
    const [, label, id] = m
    out.push(<a key={`x${k++}`} className="metriclink" onClick={() => onNav(id)}>{label}</a>)
    i = m.index + m[0].length
  }
  if (i < text.length) out.push(...linkify(text.slice(i), targets, onNav))
  return out
}

function linkify(text: string, targets: LinkTarget[], onNav: (id: string) => void): ReactNode[] {
  if (!text || !targets.length) return [text]
  const out: ReactNode[] = []
  let buf = ''
  let i = 0
  let k = 0
  const flush = () => { if (buf) { out.push(buf); buf = '' } }
  while (i < text.length) {
    let hit: LinkTarget | null = null
    for (const t of targets) {
      const seg = text.substr(i, t.name.length)
      if (seg.toLowerCase() === t.name.toLowerCase() && !isWord(text[i - 1]) && !isWord(text[i + t.name.length])) {
        hit = t; break
      }
    }
    if (hit) {
      flush()
      const label = text.substr(i, hit.name.length)
      const id = hit.id
      out.push(<a key={`l${k++}`} className="metriclink" onClick={() => onNav(id)}>{label}</a>)
      i += hit.name.length
    } else {
      buf += text[i]; i++
    }
  }
  flush()
  return out
}

// Разделитель абзацев внутри поля контента — тот же, что в исходной таблице.
const parts = (v?: string) => (v ?? '').split('<br>').map((x) => x.trim()).filter(Boolean)

// «Имя А; Имя Б» → ['Имя А', 'Имя Б']. Точка с запятой — разделитель в исходной
// таблице; в карточке имена идут списком, каждое со своей строки.
const names = (v?: string) => (v ?? '').split(';').map((x) => x.trim()).filter(Boolean)

// Для примера расчёта пустые строки НЕ выбрасываем: ими автор разделяет блоки
// (исходные данные / промежуточный счёт / итог), и без них пример читается стеной.
// Лишние пустые по краям и подряд идущие схлопываются в одну.
function exampleLines(v?: string): string[] {
  const raw = (v ?? '').split('<br>').map((x) => x.trim())
  const out: string[] = []
  for (const line of raw) {
    if (!line && (!out.length || !out[out.length - 1])) continue
    out.push(line)
  }
  while (out.length && !out[out.length - 1]) out.pop()
  return out
}

// Строка примера, которая заканчивается двоеточием и не содержит чисел, —
// это подзаголовок блока («Замер по остатку:»), а не шаг расчёта.
const isHeading = (s: string) => /:$/.test(s) && !/\d/.test(s)

// Разряды числа и знак валюты держим вместе: «4 620 000 ₽» не должно переноситься
// посреди разряда. Обычные пробелы внутри чисел заменяются неразрывными.
const nbsp = (s: string) =>
  s.replace(/(\d)[  ](?=\d)/g, '$1\u00A0').replace(/(\d)[  ](?=[₽%])/g, '$1\u00A0')

// Жирный текст: **итог** → <b>. Ручная ссылка [[…→адрес]] внутри жирного — тоже ссылка:
// жирным выделяют суть нюанса, и суть часто называет соседнюю метрику. Раньше такая
// ссылка показывалась сырой разметкой — 26.09.2026 так стояло в 21 карточке.
// Автоматических ссылок внутри жирного по-прежнему нет.
function bold(text: string, targets: LinkTarget[], onNav: (id: string) => void): ReactNode[] {
  const out: ReactNode[] = []
  let i = 0
  let k = 0
  const re = /\*\*(.+?)\*\*/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m.index > i) out.push(...withExplicit(text.slice(i, m.index), targets, onNav))
    out.push(<b key={`b${k++}`}>{withExplicit(m[1], [], onNav)}</b>)
    i = m.index + m[0].length
  }
  if (i < text.length) out.push(...withExplicit(text.slice(i), targets, onNav))
  return out
}

// Названия метрик в вопросах стоят в кавычках и совпадают с именами в Базе: из 2 196
// упоминаний — все 2 196 (сверено 05.10.2026). Автоматический linkify видит только
// соседей по карте, а вопросы называют метрики со всего Атласа. Поэтому «Имя» любой
// метрики превращается в явную ссылку [[Имя→адрес]]: метрика этого артефакта
// открывается на месте, остальные — в справочнике (решение 05.10.2026). Адрес берётся
// из открытых читателю узлов, а метрике закрытой карты — из справочника: он открыт всем.
let byName: Map<string, { id: string; mid?: number }> | null = null
let byNameWithRef = false
function metricsByName(): Map<string, { id: string; mid?: number }> {
  if (byName && (byNameWithRef || !refReady())) return byName
  const m = new Map<string, { id: string; mid?: number }>()
  for (const n of BASE.nodes) if (!m.has(n.name)) m.set(n.name, { id: n.id, mid: n.mid })
  // Метрика закрытой карты и метрика без места: адрес из справочника, ссылка ведёт туда.
  for (const r of refMetrics()) {
    const id = r.node ?? r.places[0]?.node
    if (id && !m.has(r.name)) m.set(r.name, { id, mid: r.mid })
  }
  byName = m
  byNameWithRef = refReady()
  return m
}

function quotedLinks(text: string, selfMid?: number): string {
  const names = metricsByName()
  return text.replace(/«([^«»[\]→]+)»/g, (all, name: string) => {
    const t = names.get(name)
    return t && t.mid !== selfMid ? `«[[${name}→${t.id}]]»` : all
  })
}

type CopyState = '' | 'ok' | 'fail'

type Tab = 'essence' | 'calc' | 'why' | 'dims'
// «Анализ» — разрезы метрики и под ними вопросы к ней.
const TABS: { key: Tab; label: string }[] = [
  { key: 'essence', label: 'Суть' },
  { key: 'calc', label: 'Расчёт' },
  { key: 'why', label: 'Зачем' },
  { key: 'dims', label: 'Анализ' },
]

// ── Суть метрики ───────────────────────────────────────────────────────────────
// Тег направления виден всегда, фраза-объяснение открывается по «?»: наведением
// на десктопе, нажатием на тач-устройствах (там hover не существует как жест).
const ESSENCE_KIND: Record<string, 'up' | 'down' | 'bal'> = {
  'больше-лучше': 'up', 'меньше-лучше': 'down', 'баланс': 'bal',
}

function EssenceChip({ essence, note }: { essence: string; note?: string }) {
  const [open, setOpen] = useState(false)
  const kind = ESSENCE_KIND[essence] || 'bal'
  const icon = kind === 'bal'
    ? <svg width="12" height="10" viewBox="0 0 12 10" aria-hidden="true">
        <path d="M1 5h10M3.4 2.4 1 5l2.4 2.6M8.6 2.4 11 5l-2.4 2.6" stroke="currentColor"
          strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    : <svg width="9" height="10" viewBox="0 0 9 10" aria-hidden="true"
        style={kind === 'down' ? { transform: 'rotate(180deg)' } : undefined}>
        <path d="M4.5 0.5 8 5H5.8v4.5H3.2V5H1z" fill="currentColor" />
      </svg>
  return (
    <span className={`sign sign--${kind}`}>
      {icon}
      {essence}
      {note && (
        <span className="tip" onMouseLeave={() => setOpen(false)}>
          <button type="button" className="tip__q" aria-label="Почему знак такой"
            aria-expanded={open}
            onMouseEnter={() => setOpen(true)}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onClick={e => { e.stopPropagation(); setOpen(v => !v) }}>?</button>
          <span className="tip__pop" role="tooltip" hidden={!open}>{note}</span>
        </span>
      )}
    </span>
  )
}

// Подсказка к группе вопросов: что это за вопросы. Тот же знак вопроса, что у сути
// метрики, — второй способ показывать пояснения в карточке не заводим. Хвостик
// всплывашки смотрит на знак: подзаголовок короткий, знак стоит у его левого края.
function GroupHint({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const ax = btn.current ? btn.current.offsetLeft + btn.current.offsetWidth / 2 - 6 : 14
  return (
    <span className="tip" onMouseLeave={() => setOpen(false)}>
      <button ref={btn} type="button" className="tip__q" aria-label="Что это за вопросы"
        aria-expanded={open}
        onMouseEnter={() => setOpen(true)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={e => { e.stopPropagation(); setOpen(v => !v) }}>?</button>
      <span className="tip__pop qgroup__pop" role="tooltip" hidden={!open}
        style={{ '--ax': `${ax}px` } as CSSProperties}>{text}</span>
    </span>
  )
}

const LOCK_ICON = (
  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
)
const MAP_ICON = (
  <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
    <rect x="1.5" y="2.5" width="13" height="11" rx="2" /><path d="M5.5 2.5v11M10.5 2.5v11" />
  </svg>
)
const TREE_ICON = (
  <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
    <circle cx="8" cy="3" r="1.8" /><circle cx="3.5" cy="13" r="1.8" /><circle cx="12.5" cy="13" r="1.8" />
    <path d="M8 4.8V8M8 8H3.5v3.2M8 8h4.5v3.2" />
  </svg>
)

// «Где стоит»: все места метрики группами «на карте / в деревьях», у места — его роль
// (роль принадлежит месту, свод C-28, C-29). Блок один для карт, деревьев и справочника:
// карточка сквозная (решение Марии 29.09.2026). Место, где читатель сейчас, помечено
// и не кликается; остальные открываются новой вкладкой, закрытые — окном «в полной версии».
function WherePlaces({ places, here }: { places: RefPlace[]; here?: string }) {
  const row = (p: RefPlace) => {
    const rs = roleStyle(p.role)
    const role = (
      <span className="where__role" style={{ color: rs.text }}>
        <i style={{ background: rs.color }} />{rs.label}
      </span>
    )
    if (p.node === here) {
      return (
        <div key={p.node} className="where__row is-here">
          <span className="where__nm">{p.type === 'tree' ? TREE_ICON : MAP_ICON}<span>{p.a}</span>
            <span className="where__here">вы здесь</span></span>{role}
        </div>
      )
    }
    const locked = !isSectionUnlocked(p.a)
    return (
      <button key={p.node} type="button" className={`where__row${locked ? ' is-locked' : ''}`}
        onClick={() => (locked ? openLockDialog() : openPlaceInNewTab(p.a, p.node))}>
        <span className="where__nm">{locked ? LOCK_ICON : p.type === 'tree' ? TREE_ICON : MAP_ICON}<span>{p.a}</span></span>
        {role}
      </button>
    )
  }
  const group = (type: 'map' | 'tree', one: string, many: string) => {
    const ps = places.filter((p) => p.type === type)
    return ps.length ? (
      <div className="where__grp">
        <div className="where__h">{ps.length > 1 ? many : one}</div>
        {ps.map(row)}
      </div>
    ) : null
  }
  if (!places.length) return <div className="where"><div className="where__none">Пока ни на одной карте</div></div>
  return <div className="where">{group('map', 'На карте', 'На картах')}{group('tree', 'В дереве', 'В деревьях')}</div>
}

export function NodeCard({ node, siblings, onNavigate, onClose, mode = 'map', locked = false, className = '', style }: {
  node: AtlasNode
  siblings: LinkTarget[]
  onNavigate: (id: string) => void
  onClose: () => void
  /** 'ref' — карточка открыта в справочнике: места у неё нет, поэтому вместо роли
   *  в шапке «Метрика», ссылка ведёт в справочник, кнопки «Дерево этой метрики» нет. */
  mode?: 'map' | 'ref'
  /** Метрика только из платных артефактов у неоплатившего: вкладки, кроме «Сути»,
   *  под замком, досье нет. В карточке — только то, что видно в таблице справочника. */
  locked?: boolean
  className?: string
  style?: CSSProperties
}) {
  const inRef = mode === 'ref'
  const rs = inRef ? ROLE_DEFAULT : roleStyle(node.role)
  // В аналитике метрика из справочника идёт своим адресом, а не адресом случайного места.
  const trackNode = inRef && node.mid != null
    ? { id: `spravochnik/${node.mid}`, section: 'Справочник', name: node.name } : node
  // Вкладка по умолчанию — первая в TABS, а не 'essence' строкой: тогда перестановка
  // или добавление вкладки не требует правок здесь.
  const [tab, setTab] = useState<Tab>(TABS[0].key)
  // Итог копирования: пусто — покоя, 'ok' — записали, 'fail' — браузер не дал буфер.
  // Отказ показывается словами, а не молчанием: кнопка, которая молча ничего
  // не делает, читается как сломанная, и человек жмёт её снова и снова.
  const [copied, setCopied] = useState<CopyState>('')
  const [tookDossier, setTookDossier] = useState<CopyState>('')
  // На странице Тильды справа сверху висит круглая иконка кабинета и ложится на кнопки
  // карточки. Пока карточка открыта, просим страницу её спрятать (блок /hub-atlas,
  // site-state/tilda/hub-atlas.html; на страницах карт её и так прячет HEAD сайта).
  useEffect(() => {
    if (!EMBED) return
    const say = (open: boolean) => {
      try { window.parent.postMessage({ type: 'jm-atlas-card', open }, '*') } catch { /* нет родителя */ }
    }
    say(true)
    return () => say(false)
  }, [])
  // Контент грузится отдельным файлом уже после карты: как только пришёл — перерисуемся.
  const [, force] = useState(0)
  useEffect(() => onContentReady(() => force((n) => n + 1)), [])
  useEffect(() => onRefReady(() => force((n) => n + 1)), [])
  useEffect(() => onQuestionsReady(() => force((n) => n + 1)), [])
  // Вопросы весят около 2 МБ: файл просим, только когда открыли «Анализ».
  useEffect(() => { if (tab === 'dims') loadQuestions() }, [tab])
  // Новая метрика — снова открываем первую вкладку.
  // Здесь же считаем открытие метрики и показ первой вкладки.
  // React.StrictMode в деве прогоняет эффект дважды — без этой отсечки открытие
  // метрики считалось бы за два. В проде StrictMode так не делает, но зависеть от
  // режима сборки в аналитике нельзя: удвоение чисел заметили бы не сразу.
  const tracked = useRef<string | null>(null)
  useEffect(() => {
    setTab(TABS[0].key)
    setCopied('')
    setTookDossier('')
    if (tracked.current !== trackNode.id) {
      tracked.current = trackNode.id
      // Два события: сам факт открытия и показ первой вкладки — она показывается
      // без клика, но это такой же показ, как и любой другой.
      trackMetric('metric_open', trackNode, TABS[0].key, TABS[0].label)
      trackMetric('metric_view', trackNode, TABS[0].key, TABS[0].label)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.id])

  const c = metricContent(node.id)
  // Открытые поля справочника — запасной источник: у метрики платной карты неоплатившему
  // контент не приходит, а суть и другие имена в таблице видны всем.
  const ref = refByMid(node.mid)
  // Ссылка на метрику без места ведёт в справочник: с карты и из дерева — новой вкладкой,
  // в самом справочнике карточка открывается на месте (onNavigate справочника знает адрес).
  const nav = (id: string) => {
    if (!inRef && isRefOnly(id)) {
      const mid = midOfNode(id)
      if (mid != null) window.open(refUrl(mid), '_blank', 'noopener')
      return
    }
    onNavigate(id)
  }
  const L = (t: string) => withExplicit(t, siblings, nav)

  // Поля контента с запасным вариантом из базы, пока файл не приехал.
  const description = c['Описание'] || node.description
  const formula = c['Формула'] || node.formula
  const nuances = parts(c['Нюансы расчёта'])
  const example = exampleLines(c['Пример расчёта'])
  const why = c['Важность']
  const whenNot = c['Когда не нужна']
  // Суть: тег направления стоит рядом с единицей, объяснение открывается по знаку
  // вопроса. Постоянно виден знак, фраза вызывается наведением — решено 04.09.2026.
  const essence = c['Суть'] || ref?.ess
  const essenceNote = c['Суть · пояснение']
  // Другие имена метрики: русский синоним и английское название. Хранятся строкой,
  // несколько имён разделены «;» — показываем списком, по имени на строку.
  const synonyms = names(c['Синонимы'] || ref?.syn)
  const english = names(c['EN'] || ref?.en)
  const dims = c['Разрезы'] ?? []
  // Метрика, которую разбирает своё дерево: из карточки в него ведёт кнопка.
  const tree = inRef ? undefined : treeOfMetric(node)
  // С карты дерево открывается новой вкладкой: это другой артефакт, и карта,
  // с которой пришли, должна остаться. Внутри разбора переход идёт на месте.
  const fromMap = !(BASE.trees ?? []).some((t) => t.name === node.section)
  const hasCalc = nuances.length > 0 || example.length > 0
  const hasWhy = !!(why || whenNot)
  // Вопросы есть у каждой метрики, которую человеку видно: у неё пришла карточка.
  // Поэтому «Анализ» открыт и у метрики без разрезов, если карточка на месте.
  const questions = metricQuestions(node.mid)
  const hasDims = dims.length > 0 || Object.keys(c).length > 0

  // Ссылка на метрику: страница Тильды её карты + ?node=. Внутри iframe адрес самого
  // приложения ведёт на бакет, поэтому собираем публичный адрес, а не берём location.
  const copyLink = async () => {
    // У метрики дерева свой вид адреса: ?tree=, а не ?map= (site/nav.ts).
    const url = inRef && node.mid != null ? refUrl(node.mid) : metricUrl(node.section, node.id)
    const ok = await copyText(url.startsWith('http') ? url : `${window.location.origin}${url}`)
    setCopied(ok ? 'ok' : 'fail')
    window.setTimeout(() => setCopied(''), 1800)
  }

  // Досье метрики текстом: всё, что показывает карточка, плюс связи — их на карте
  // видно стрелками, а в карточке нет. Кнопка стоит в подвале панели: она нужна
  // на любой вкладке, а прокрутка тела не должна её уносить.
  const copyDossier = async () => {
    const ok = await copyText(metricDossier(node))
    setTookDossier(ok ? 'ok' : 'fail')
    // Считаем только удавшееся копирование: отказ буфера — не действие читателя.
    if (ok) trackMetric('metric_copy', trackNode, tab, TABS.find((t) => t.key === tab)?.label ?? '')
    window.setTimeout(() => setTookDossier(''), 1800)
  }

  return (
    <aside className={`panel ${className}`.trim()} style={style}>
      <button className="panel__close" onClick={onClose} aria-label="Закрыть">×</button>
      <button
        className={`panel__copy${copied === 'ok' ? ' is-done' : ''}${copied === 'fail' ? ' is-fail' : ''}`}
        onClick={copyLink}
        aria-label="Скопировать ссылку на метрику"
        data-tip={copied === 'ok' ? 'Скопировано'
          : copied === 'fail' ? 'Не удалось скопировать' : 'Ссылка на метрику'}
      >
        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M6.5 9.5a3 3 0 0 0 4.24 0l2.12-2.12a3 3 0 0 0-4.24-4.24l-.7.7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M9.5 6.5a3 3 0 0 0-4.24 0L3.14 8.62a3 3 0 0 0 4.24 4.24l.7-.7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      {node.mid != null && (
        <span className="panel__mid" title="Номер метрики в Атласе">
          №{String(node.mid).padStart(4, '0')}
        </span>
      )}

      <div className="panel__head">
        <span className="panel__role" style={{ color: rs.text }}>
          <span style={{ width: 9, height: 9, borderRadius: 3, background: rs.color }} />
          {rs.label}
        </span>
        <h2 className="panel__name">{node.name}</h2>
        {(synonyms.length > 0 || english.length > 0) && (
          <div className="panel__aka">
            {synonyms.length > 0 && (
              <>
                <span className="panel__aka-tag">она же</span>
                <span className="panel__aka-names">
                  {synonyms.map((s, i) => <span key={i}>{s}</span>)}
                </span>
              </>
            )}
            {english.length > 0 && (
              <>
                <span className="panel__aka-tag">eng</span>
                <span className="panel__aka-names">
                  {english.map((s, i) => <span key={i}>{s}</span>)}
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {locked ? (
        // Вкладки видны, чтобы было понятно, что ещё есть в карточке; сами тексты закрыты.
        <div className="panel__tabs" role="tablist">
          {TABS.map((t) => t.key === 'essence' ? (
            <button key={t.key} role="tab" className="panel__tab" aria-selected>{t.label}</button>
          ) : (
            <button key={t.key} role="tab" className="panel__tab is-locked" aria-selected={false}
              onClick={openLockDialog}>{t.label}{LOCK_ICON}</button>
          ))}
        </div>
      ) : (hasCalc || hasWhy || hasDims) && (
        <div className="panel__tabs" role="tablist">
          {TABS.map((t) => {
            const disabled = (t.key === 'calc' && !hasCalc) || (t.key === 'why' && !hasWhy) ||
              (t.key === 'dims' && !hasDims)
            if (disabled) return null
            return (
              <button
                key={t.key}
                role="tab"
                className="panel__tab"
                aria-selected={tab === t.key}
                onClick={() => { setTab(t.key); trackMetric('metric_view', trackNode, t.key, t.label) }}
              >
                {t.label}
              </button>
            )
          })}
        </div>
      )}

      <div className="panel__body">
        {tab === 'essence' && (
          <>
            {description && (
              <div className="panel__section">
                <div className="panel__label">Что это</div>
                <div className="panel__text">{parts(description).map((p, i) => <p key={i} className="panel__para">{bold(p, siblings, nav)}</p>)}</div>
              </div>
            )}
            {formula && (
              <div className="panel__section">
                <div className="panel__label">Формула</div>
                <div className="panel__formula">
                  {parts(formula).map((line, i) => (
                    <div key={i}>{L(line)}</div>
                  ))}
                </div>
              </div>
            )}
            {(node.units || essence) && (
              <div className="panel__section">
                <div className="panel__label">{essence ? 'Единицы и суть' : 'Единицы'}</div>
                <div className="panel__tags">
                  {node.units && <span className="chip chip--unit">{node.units}</span>}
                  {essence && <EssenceChip essence={essence} note={essenceNote} />}
                </div>
              </div>
            )}
            {ref && (
              <div className="panel__section">
                <div className="panel__label">Где стоит</div>
                <WherePlaces places={ref.places} here={inRef ? undefined : node.id} />
              </div>
            )}
            {tree && (
              <div className="panel__section">
                <button className="panel__tree" onClick={() => openTree(tree.slug, undefined, fromMap)}>
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor"
                    strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M8 2.5v3M8 5.5h-4v2M8 5.5h4v2" />
                    <rect x="2" y="7.5" width="4" height="3" rx="1" />
                    <rect x="10" y="7.5" width="4" height="3" rx="1" />
                  </svg>
                  Дерево этой метрики
                  <span className="panel__tree-n">{tree.nodes - 1}</span>
                </button>
              </div>
            )}
            {!contentReady() && <div className="panel__hint">Загружаем подробности…</div>}
          </>
        )}

        {tab === 'calc' && (
          <>
            {nuances.length > 0 && (
              <div className="panel__section">
                <div className="panel__label">Нюансы расчёта</div>
                <ul className="panel__bullets">
                  {nuances.map((n, i) => <li key={i}>{bold(n, siblings, nav)}</li>)}
                </ul>
              </div>
            )}
            {example.length > 0 && (
              <div className="panel__section">
                <div className="panel__label">Пример расчёта</div>
                <div className="panel__example">
                  {example.map((line, i) => {
                    if (!line) return <div key={i} className="panel__example-gap" />
                    if (isHeading(line)) return <div key={i} className="panel__example-head">{line}</div>
                    const isResult = line.includes('**')
                    return (
                      <div key={i} className={isResult ? 'panel__example-result' : undefined}>
                        {bold(nbsp(line), siblings, nav)}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {tab === 'dims' && (
          <>
            {dims.length > 0 && (
              <div className="panel__section">
                <div className="panel__label">Разрезы</div>
                <ul className="panel__bullets">
                  {dims.map((d, i) => (
                    <li key={i}><b>{d.name}</b>{d.note ? ` — ${d.note}` : ''}</li>
                  ))}
                </ul>
              </div>
            )}
            {/* Вопросы — под разрезами (решение Марии). Группы — подзаголовками в стиле
                заголовка, мельче его; у группы подсказка, что это за вопросы. */}
            {questions.length > 0 ? (
              <div className="panel__section">
                {dims.length > 0 && <div className="panel__split" />}
                <div className="panel__label">Вопросы</div>
                {questions.map(({ group, items }) => (
                  <div key={group.id} className="qgroup">
                    <div className="panel__label qgroup__label">
                      {group.name}<span className="qgroup__n">{items.length}</span>
                      <GroupHint text={group.hint} />
                    </div>
                    <ol className="panel__bullets qgroup__list">
                      {items.map((t, i) => <li key={i} data-n={i + 1}>{bold(quotedLinks(t, node.mid), siblings, nav)}</li>)}
                    </ol>
                  </div>
                ))}
              </div>
            ) : !questionsReady() && <div className="panel__hint">Загружаем вопросы…</div>}
          </>
        )}

        {tab === 'why' && (
          <>
            {why && (
              <div className="panel__section">
                <div className="panel__label">Важность</div>
                <div className="panel__text">
                  {parts(why).map((p, i) => <p key={i} className="panel__para">{bold(p, siblings, nav)}</p>)}
                </div>
              </div>
            )}
            {whenNot && (
              <div className="panel__section">
                <div className="panel__label">Когда не нужна</div>
                <div className="panel__text">
                  {parts(whenNot).map((p, i) => <p key={i} className="panel__para">{bold(p, siblings, nav)}</p>)}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {!locked && <div className="panel__foot">
        <button
          className={`panel__dossier${tookDossier === 'ok' ? ' is-done' : ''}${tookDossier === 'fail' ? ' is-fail' : ''}`}
          onClick={copyDossier}
        >
          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <rect x="5.5" y="5.5" width="8" height="9" rx="1.6" stroke="currentColor" strokeWidth="1.4" />
            <path d="M10.5 3.5h-6A1.5 1.5 0 0 0 3 5v7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          {tookDossier === 'ok' ? 'Досье в буфере'
            : tookDossier === 'fail' ? 'Не удалось скопировать'
            : 'Скопировать досье о метрике'}
        </button>
      </div>}
    </aside>
  )
}
