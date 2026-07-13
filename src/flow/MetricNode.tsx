import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { ContextRole, Controllability } from '../graph/types'
import { CTRL_COLOR, CTRL_LABEL, NODE_H, NODE_W, TOKENS } from './tokens'

export interface MetricNodeData {
  ru: string
  en: string
  role: ContextRole
  roleLabel?: string // переопределить подпись роли (на карте — управляемость)
  hideCtrl?: boolean // скрыть чип управляемости (на карте он дублирует подпись роли)
  controllability: Controllability
  goodhart: boolean
  orientation: 'h' | 'v'
  hiddenIn: number
  hiddenOut: number
  dim?: boolean
  active?: boolean
  onExpand?: (id: string) => void
  [key: string]: unknown
}

export function MetricNode({ id, data, selected }: NodeProps) {
  const d = data as MetricNodeData
  // Цвет узла = УПРАВЛЯЕМОСТЬ везде (единый смысл: что можно крутить). Фокус выделяется рамкой.
  const accent = CTRL_COLOR[d.controllability]
  const dimmed = d.dim && !d.active
  const h = d.orientation === 'h'

  const sourcePos = h ? Position.Left : Position.Top
  const targetPos = h ? Position.Right : Position.Bottom
  // 4-сторонние хэндлы: рёбра выбирают сторону по геометрии (App), маршрут ортогональный.
  const SIDES: [string, Position][] = [['top', Position.Top], ['bottom', Position.Bottom], ['left', Position.Left], ['right', Position.Right]]
  const hStyle: React.CSSProperties = { opacity: 0, width: 1, height: 1, border: 0 }

  const badge = (n: number, dir: 'in' | 'out') => {
    if (!n) return null
    // in = драйверы, out = исходы. Позиция зависит от ориентации.
    const style: React.CSSProperties = { position: 'absolute', zIndex: 3 }
    if (h) {
      // дерево: драйверы справа
      Object.assign(style, { right: -14, top: '50%', transform: 'translateY(-50%)' })
    } else if (dir === 'out') {
      Object.assign(style, { top: -12, left: '50%', transform: 'translateX(-50%)' })
    } else {
      Object.assign(style, { bottom: -12, left: '50%', transform: 'translateX(-50%)' })
    }
    return (
      <button
        onClick={(e) => { e.stopPropagation(); d.onExpand?.(id) }}
        style={{
          ...style,
          fontFamily: TOKENS.fontMono, fontSize: 9, fontWeight: 600,
          background: '#fff', color: accent, border: `1px solid ${accent}`, borderRadius: 10,
          padding: '1px 6px', cursor: 'pointer', lineHeight: 1.4, whiteSpace: 'nowrap',
        }}
        title="Развернуть ветку"
      >
        +{n}
      </button>
    )
  }

  return (
    <div
      style={{
        position: 'relative',
        width: NODE_W, height: NODE_H, boxSizing: 'border-box',
        background: TOKENS.card,
        border: `${selected ? 2 : 1}px solid ${selected ? accent : TOKENS.border}`,
        borderRadius: 9, padding: '8px 11px', fontFamily: TOKENS.fontUI,
        boxShadow: selected ? `0 0 0 4px ${accent}1f, 0 4px 14px ${accent}26` : '0 1px 2px rgba(31,42,55,.05)',
        opacity: dimmed ? 0.32 : 1,
        transition: 'opacity .17s ease, box-shadow .17s ease, border-color .17s ease',
        cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', gap: 3,
      }}
      title={d.ru}
    >
      {/* дефолтные хэндлы (дерево / фолбэк) */}
      <Handle type="source" position={sourcePos} style={hStyle} />
      <Handle type="target" position={targetPos} style={hStyle} />
      {/* адресуемые хэндлы по сторонам (карта: выбор стороны по геометрии ребра) */}
      {SIDES.map(([key, p]) => (
        <span key={key}>
          <Handle id={`s-${key}`} type="source" position={p} style={hStyle} />
          <Handle id={`t-${key}`} type="target" position={p} style={hStyle} />
        </span>
      ))}

      {/* единая метка = управляемость (цвет = она же) + goodhart */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: accent, flexShrink: 0 }} />
        <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: accent }}>
          {CTRL_LABEL[d.controllability]}
        </span>
        {d.goodhart && <span title="Опасно делать целью (Goodhart)" style={{ marginLeft: 'auto', fontSize: 10 }}>⚠️</span>}
      </div>

      {/* RU-название (до 2 строк). EN-референс — в карточке метрики/связи, на узле не дублируем. */}
      <div style={{ fontSize: 12.5, fontWeight: 600, color: TOKENS.text, lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
        {d.ru}
      </div>

      {badge(d.hiddenIn, 'in')}
      {!h && badge(d.hiddenOut, 'out')}
    </div>
  )
}
