import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'

export interface GroupNodeData {
  title: string
  [key: string]: unknown
}

// Подраздел карты (авторская группировка метрик по смыслу). Рамка — светлый пунктир,
// заголовок — «ярлык-таб» в левом-верхнем углу (плашка с рамкой и лёгкой тенью),
// чтобы читался как подпись контейнера, а не как случайный текст на холсте.
// Рисуется позади карточек, клики пропускает.
function GroupNodeBase({ data }: NodeProps) {
  const d = data as GroupNodeData
  return (
    <div
      style={{
        width: '100%', height: '100%', boxSizing: 'border-box',
        border: '1px dashed color-mix(in srgb, var(--jm-line) 65%, transparent)',
        borderRadius: 16,
        background: 'transparent',
        pointerEvents: 'none', position: 'relative',
      }}
    >
      <span style={{
        position: 'absolute', top: -12, left: 12,
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '3px 9px',
        background: 'var(--jm-surface)', color: 'var(--jm-muted)',
        border: '1px solid var(--jm-line)', borderRadius: 7, boxShadow: 'var(--jm-e1)',
        fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, fontWeight: 600,
        letterSpacing: '.06em', textTransform: 'uppercase', whiteSpace: 'nowrap',
      }}>
        <span style={{
          width: 5, height: 5, borderRadius: 1.5,
          background: 'var(--jm-faint)', flex: 'none',
        }} />
        {d.title}
      </span>
    </div>
  )
}

export const GroupNode = memo(GroupNodeBase)
