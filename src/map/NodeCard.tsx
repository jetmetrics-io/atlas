import { type ReactNode } from 'react'
import type { AtlasNode } from '../atlas/types'
import { roleStyle } from '../atlas/style'

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

export function NodeCard({ node, siblings, onNavigate, onClose }: {
  node: AtlasNode
  siblings: LinkTarget[]
  onNavigate: (id: string) => void
  onClose: () => void
}) {
  const rs = roleStyle(node.role)
  return (
    <aside className="panel">
      <button className="panel__close" onClick={onClose} aria-label="Закрыть">×</button>
      <div className="panel__head">
        <span className="panel__role" style={{ color: rs.text }}>
          <span style={{ width: 9, height: 9, borderRadius: 3, background: rs.color }} />
          {rs.label}
        </span>
        <h2 className="panel__name">{node.name}</h2>
      </div>
      <div className="panel__body">
        {node.description && (
          <div className="panel__section">
            <div className="panel__label">Что это</div>
            <div className="panel__text">{linkify(node.description, siblings, onNavigate)}</div>
          </div>
        )}
        {node.formula && (
          <div className="panel__section">
            <div className="panel__label">Формула</div>
            <div className="panel__formula">{linkify(node.formula, siblings, onNavigate)}</div>
          </div>
        )}
        {node.units && (
          <div className="panel__section">
            <div className="panel__label">Единицы</div>
            <span className="chip" style={{ background: rs.tint, color: rs.text }}>{node.units}</span>
          </div>
        )}
      </div>
    </aside>
  )
}
