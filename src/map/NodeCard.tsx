import { type ReactNode, useEffect, useRef, useState } from 'react'
import { trackMetric } from '../site/analytics'
import type { AtlasNode } from '../atlas/types'
import { roleStyle } from '../atlas/style'
import { metricContent, contentReady, onContentReady } from '../atlas/content'
import { mapPageUrl } from '../site/nav'

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

// Жирный текст в примере расчёта: **итог** → <b>
function bold(text: string, targets: LinkTarget[], onNav: (id: string) => void): ReactNode[] {
  const out: ReactNode[] = []
  let i = 0
  let k = 0
  const re = /\*\*(.+?)\*\*/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m.index > i) out.push(...withExplicit(text.slice(i, m.index), targets, onNav))
    out.push(<b key={`b${k++}`}>{m[1]}</b>)
    i = m.index + m[0].length
  }
  if (i < text.length) out.push(...withExplicit(text.slice(i), targets, onNav))
  return out
}

type Tab = 'essence' | 'calc' | 'why'
const TABS: { key: Tab; label: string }[] = [
  { key: 'essence', label: 'Суть' },
  { key: 'calc', label: 'Расчёт' },
  { key: 'why', label: 'Зачем' },
]

export function NodeCard({ node, siblings, onNavigate, onClose }: {
  node: AtlasNode
  siblings: LinkTarget[]
  onNavigate: (id: string) => void
  onClose: () => void
}) {
  const rs = roleStyle(node.role)
  // Вкладка по умолчанию — первая в TABS, а не 'essence' строкой: тогда перестановка
  // или добавление вкладки не требует правок здесь.
  const [tab, setTab] = useState<Tab>(TABS[0].key)
  const [copied, setCopied] = useState(false)
  // Контент грузится отдельным файлом уже после карты: как только пришёл — перерисуемся.
  const [, force] = useState(0)
  useEffect(() => onContentReady(() => force((n) => n + 1)), [])
  // Новая метрика — снова открываем первую вкладку.
  // Здесь же считаем открытие метрики и показ первой вкладки.
  // React.StrictMode в деве прогоняет эффект дважды — без этой отсечки открытие
  // метрики считалось бы за два. В проде StrictMode так не делает, но зависеть от
  // режима сборки в аналитике нельзя: удвоение чисел заметили бы не сразу.
  const tracked = useRef<string | null>(null)
  useEffect(() => {
    setTab(TABS[0].key)
    setCopied(false)
    if (tracked.current !== node.id) {
      tracked.current = node.id
      // Два события: сам факт открытия и показ первой вкладки — она показывается
      // без клика, но это такой же показ, как и любой другой.
      trackMetric('metric_open', node, TABS[0].key, TABS[0].label)
      trackMetric('metric_view', node, TABS[0].key, TABS[0].label)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.id])

  const c = metricContent(node.id)
  const L = (t: string) => withExplicit(t, siblings, onNavigate)

  // Поля контента с запасным вариантом из базы, пока файл не приехал.
  const description = c['Описание'] || node.description
  const formula = c['Формула'] || node.formula
  const nuances = parts(c['Нюансы расчёта'])
  const example = exampleLines(c['Пример расчёта'])
  const why = c['Важность']
  const whenNot = c['Когда не нужна']
  // Другие имена метрики: русский синоним и английское название. Хранятся строкой,
  // несколько имён разделены «;» — показываем списком, по имени на строку.
  const synonyms = names(c['Синонимы'])
  const english = names(c['EN'])
  const hasCalc = nuances.length > 0 || example.length > 0
  const hasWhy = !!(why || whenNot)

  // Ссылка на метрику: страница Тильды её карты + ?node=. Внутри iframe адрес самого
  // приложения ведёт на бакет, поэтому собираем публичный адрес, а не берём location.
  const copyLink = () => {
    const page = mapPageUrl(node.section)
    const url = page ? `${page}?node=${node.id}` : `${window.location.origin}${window.location.pathname}?map=${encodeURIComponent(node.section)}&node=${node.id}`
    navigator.clipboard?.writeText(url).catch(() => {})
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  return (
    <aside className="panel">
      <button className="panel__close" onClick={onClose} aria-label="Закрыть">×</button>
      <button
        className={`panel__copy${copied ? ' is-done' : ''}`}
        onClick={copyLink}
        aria-label="Скопировать ссылку на метрику"
        data-tip={copied ? 'Скопировано' : 'Ссылка на метрику'}
      >
        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M6.5 9.5a3 3 0 0 0 4.24 0l2.12-2.12a3 3 0 0 0-4.24-4.24l-.7.7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M9.5 6.5a3 3 0 0 0-4.24 0L3.14 8.62a3 3 0 0 0 4.24 4.24l.7-.7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

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

      {(hasCalc || hasWhy) && (
        <div className="panel__tabs" role="tablist">
          {TABS.map((t) => {
            const disabled = (t.key === 'calc' && !hasCalc) || (t.key === 'why' && !hasWhy)
            if (disabled) return null
            return (
              <button
                key={t.key}
                role="tab"
                className="panel__tab"
                aria-selected={tab === t.key}
                onClick={() => { setTab(t.key); trackMetric('metric_view', node, t.key, t.label) }}
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
                <div className="panel__text">{parts(description).map((p, i) => <p key={i} className="panel__para">{bold(p, siblings, onNavigate)}</p>)}</div>
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
            {node.units && (
              <div className="panel__section">
                <div className="panel__label">Единицы</div>
                <span className="chip" style={{ background: rs.tint, color: rs.text }}>{node.units}</span>
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
                  {nuances.map((n, i) => <li key={i}>{bold(n, siblings, onNavigate)}</li>)}
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
                        {bold(nbsp(line), siblings, onNavigate)}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {tab === 'why' && (
          <>
            {why && (
              <div className="panel__section">
                <div className="panel__label">Важность</div>
                <div className="panel__text">
                  {parts(why).map((p, i) => <p key={i} className="panel__para">{bold(p, siblings, onNavigate)}</p>)}
                </div>
              </div>
            )}
            {whenNot && (
              <div className="panel__section">
                <div className="panel__label">Когда не нужна</div>
                <div className="panel__text">
                  {parts(whenNot).map((p, i) => <p key={i} className="panel__para">{bold(p, siblings, onNavigate)}</p>)}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  )
}
