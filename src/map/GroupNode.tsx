import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'

export interface GroupNodeData {
  title: string
  fill?: boolean
  [key: string]: unknown
}

// Подраздел карты (авторская группировка метрик по смыслу). Читается как «регион»
// за счёт лёгкой заливки + сплошной тонкой рамки — белые карточки контрастно лежат
// внутри зоны. Заголовок — «ярлык-таб» в левом-верхнем углу.
// Рисуется позади карточек, клики пропускает.
// fill=false — зона пересекается с бо́льшой (вложенные группы Miro): заливку гасим,
// оставляем контур, чтобы две подложки не складывались в тёмное пятно.
function GroupNodeBase({ data }: NodeProps) {
  const d = data as GroupNodeData
  const fill = d.fill !== false
  return (
    <div
      style={{
        width: '100%', height: '100%', boxSizing: 'border-box',
        border: '1.5px solid color-mix(in srgb, var(--jm-ink) 18%, transparent)',
        borderRadius: 16,
        background: fill ? 'color-mix(in srgb, var(--jm-ink) 5.5%, transparent)' : 'transparent',
        pointerEvents: 'none', position: 'relative',
      }}
    >
      <span style={{
        position: 'absolute', top: -12, left: 12,
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '3px 10px',
        background: 'var(--jm-surface)', color: 'var(--jm-text)',
        border: '1px solid color-mix(in srgb, var(--jm-ink) 14%, transparent)',
        borderRadius: 7, boxShadow: 'var(--jm-e1)',
        fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, fontWeight: 600,
        letterSpacing: '.06em', textTransform: 'uppercase', whiteSpace: 'nowrap',
      }}>
        <span style={{
          width: 5, height: 5, borderRadius: 1.5,
          background: 'var(--jm-muted)', flex: 'none',
        }} />
        {d.title}
      </span>
    </div>
  )
}

export const GroupNode = memo(GroupNodeBase)
