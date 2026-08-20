import { type ReactNode, useEffect, useState } from 'react'
import type { AtlasNode } from '../atlas/types'
import { roleStyle } from '../atlas/style'
import { metricContent, contentReady, onContentReady } from '../atlas/content'
import { mapPageUrl } from '../site/nav'

export type LinkTarget = { name: string; id: string }

const isWord = (c?: string) => !!c && /[\p{L}\p{N}]/u.test(c)

// Найти в тексте упоминания других метрик карты и сделать их кликабельными.
// targets должны идти от длинных названий к коротким (жадный матч по длине).
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

// Жирный текст в примере расчёта: **итог** → <b>
function bold(text: string, targets: LinkTarget[], onNav: (id: string) => void): ReactNode[] {
  const out: ReactNode[] = []
  let i = 0
  let k = 0
  const re = /\*\*(.+?)\*\*/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m.index > i) out.push(...linkify(text.slice(i, m.index), targets, onNav))
    out.push(<b key={`b${k++}`}>{m[1]}</b>)
    i = m.index + m[0].length
  }
  if (i < text.length) out.push(...linkify(text.slice(i), targets, onNav))
  return out
}

type Tab = 'suть' | 'raschet' | 'zachem'
const TABS: { key: Tab; label: string }[] = [
  { key: 'suть', label: 'Суть' },
  { key: 'raschet', label: 'Расчёт' },
  { key: 'zachem', label: 'Зачем' },
]

export function NodeCard({ node, siblings, onNavigate, onClose }: {
  node: AtlasNode
  siblings: LinkTarget[]
  onNavigate: (id: string) => void
  onClose: () => void
}) {
  const rs = roleStyle(node.role)
  const [tab, setTab] = useState<Tab>('suть')
  const [copied, setCopied] = useState(false)
  // Контент грузится отдельным файлом уже после карты: как только пришёл — перерисуемся.
  const [, force] = useState(0)
  useEffect(() => onContentReady(() => force((n) => n + 1)), [])
  // Новая метрика — снова открываем первую вкладку.
  useEffect(() => { setTab('suть'); setCopied(false) }, [node.id])

  const c = metricContent(node.id)
  const L = (t: string) => linkify(t, siblings, onNavigate)

  // Поля контента с запасным вариантом из базы, пока файл не приехал.
  const description = c['Описание'] || node.description
  const formula = c['Формула'] || node.formula
  const nuances = parts(c['Нюансы расчёта'])
  const example = parts(c['Пример расчёта'])
  const why = c['Важность']
  const whenNot = c['Когда не нужна']
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
      </div>

      {(hasCalc || hasWhy) && (
        <div className="panel__tabs" role="tablist">
          {TABS.map((t) => {
            const disabled = (t.key === 'raschet' && !hasCalc) || (t.key === 'zachem' && !hasWhy)
            if (disabled) return null
            return (
              <button
                key={t.key}
                role="tab"
                className="panel__tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </button>
            )
          })}
        </div>
      )}

      <div className="panel__body">
        {tab === 'suть' && (
          <>
            {description && (
              <div className="panel__section">
                <div className="panel__label">Что это</div>
                <div className="panel__text">{L(description)}</div>
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

        {tab === 'raschet' && (
          <>
            {nuances.length > 0 && (
              <div className="panel__section">
                <div className="panel__label">Нюансы расчёта</div>
                <ul className="panel__bullets">
                  {nuances.map((n, i) => <li key={i}>{L(n)}</li>)}
                </ul>
              </div>
            )}
            {example.length > 0 && (
              <div className="panel__section">
                <div className="panel__label">Пример расчёта</div>
                <div className="panel__example">
                  {example.map((line, i) => <div key={i}>{bold(line, siblings, onNavigate)}</div>)}
                </div>
              </div>
            )}
          </>
        )}

        {tab === 'zachem' && (
          <>
            {why && (
              <div className="panel__section">
                <div className="panel__label">Важность</div>
                <div className="panel__text">{L(why)}</div>
              </div>
            )}
            {whenNot && (
              <div className="panel__section">
                <div className="panel__label">Когда не нужна</div>
                <div className="panel__text">{L(whenNot)}</div>
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  )
}
