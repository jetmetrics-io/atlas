import { memo, useState } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { roleStyle } from '../atlas/style'

export interface MetricNodeData {
  name: string
  role: string
  units?: string
  key?: boolean
  selected?: boolean
  dimmed?: boolean
  hovered?: boolean
  // Подсветка по роли (клик роли в легенде): рамка в цвет роли, мягкое кольцо.
  highlight?: boolean
  [key: string]: unknown
}

const mix = (a: string, b: string, p: number) => `color-mix(in srgb, ${a} ${p}%, ${b})`

// 4-сторонние адресуемые хэндлы (сторону выбирает MapView по геометрии).
const HANDLES: [string, string, Position][] = [
  ['sr', 'tr', Position.Right],
  ['sl', 'tl', Position.Left],
  ['st', 'tt', Position.Top],
  ['sb', 'tb', Position.Bottom],
]

// ── Иконки единиц измерения (штрих, currentColor). Контурный кружок — вариант 1. ──
const UNIT_ICON: Record<string, JSX.Element> = {
  'Количество': (
    <path d="M9.8 5.6 8.4 18.4M15.6 5.6 14.2 18.4M6.2 9.7h12.2M5.7 14.3h12.2" />
  ),
  '%': (
    <><circle cx="8" cy="8" r="2.3" /><circle cx="16" cy="16" r="2.3" /><path d="M16.6 6.6 7.4 17.4" /></>
  ),
  'Деньги': (
    <><rect x="3" y="6.6" width="18" height="10.8" rx="2.2" /><circle cx="12" cy="12" r="2.4" /><path d="M6.2 9.3v5.4M17.8 9.3v5.4" /></>
  ),
  'Время': (
    <><circle cx="12" cy="12" r="8.3" /><path d="M12 7.4V12l3.1 1.9" /></>
  ),
}
const UNIT_TITLE: Record<string, string> = {
  'Количество': 'Измеряется в количестве',
  '%': 'Измеряется в процентах',
  'Деньги': 'Измеряется в деньгах',
  'Время': 'Измеряется во времени',
}

function UnitIcon({ units }: { units?: string }) {
  const [show, setShow] = useState(false)
  const path = units ? UNIT_ICON[units] : undefined
  if (!path) return null
  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', flex: 'none' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <span
        style={{
          width: 22, height: 22, borderRadius: '50%',
          border: '1.5px solid var(--jm-line)', color: 'var(--jm-text)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor"
          strokeWidth={units === 'Деньги' ? 1.7 : 1.8} strokeLinecap="round" strokeLinejoin="round">
          {path}
        </svg>
      </span>
      {show && (
        <span
          role="tooltip"
          style={{
            position: 'absolute', bottom: 'calc(100% + 7px)', right: -2,
            background: '#0A0D10', color: '#fff', whiteSpace: 'nowrap',
            fontFamily: 'var(--jm-font-sans)', fontSize: 11, lineHeight: 1.2,
            padding: '5px 9px', borderRadius: 7, pointerEvents: 'none', zIndex: 60,
            boxShadow: '0 6px 18px rgba(0,0,0,.28)',
          }}
        >
          {UNIT_TITLE[units!] ?? units}
          <span style={{
            position: 'absolute', top: '100%', right: 10, width: 0, height: 0,
            borderLeft: '5px solid transparent', borderRight: '5px solid transparent',
            borderTop: '5px solid #0A0D10',
          }} />
        </span>
      )}
    </span>
  )
}

// Чёрный чип ключевой метрики с золотой короной. Тон фиксированный (не токен) —
// чип остаётся чёрным и в тёмной теме.
function KeyChip() {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, height: 18, padding: '0 8px 0 6px',
      borderRadius: 999, background: '#0A0D10', color: '#fff',
      fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, fontWeight: 600, letterSpacing: '.02em',
      whiteSpace: 'nowrap', flex: 'none',
    }}>
      <svg viewBox="0 0 24 20" width="11" height="9" fill="#F0C24D" style={{ display: 'block' }}>
        <path d="M2 6l4.2 3.4L12 2l5.8 7.4L22 6l-1.7 11H3.7L2 6z" />
      </svg>
      Ключевая
    </span>
  )
}

function MetricNodeBase({ data }: NodeProps) {
  const d = data as MetricNodeData
  const rs = roleStyle(d.role)
  const isFocus = d.selected
  const isHover = d.hovered
  const isHi = d.highlight

  return (
    <div
      style={{
        width: '100%', height: '100%', boxSizing: 'border-box',
        background: 'var(--jm-surface)',
        border: `${isFocus ? 2 : 1}px solid ${isFocus || isHover || isHi ? rs.color : 'var(--jm-line)'}`,
        borderRadius: 9,
        boxShadow: isHover
          ? `0 8px 20px ${mix(rs.color, 'transparent', 24)}`
          : isFocus
            ? `0 0 0 3px ${mix(rs.color, 'transparent', 16)}`
            : isHi
              ? `0 0 0 2px ${mix(rs.color, 'transparent', 12)}`
              : 'var(--jm-e1)',
        opacity: d.dimmed ? 0.22 : 1,
        transform: isHover ? 'translateY(-1px)' : 'none',
        transition: 'opacity .16s ease, box-shadow .16s ease, border-color .16s ease, transform .16s ease',
        padding: '10px 12px 12px',
        display: 'flex', flexDirection: 'column',
        // overflow видимый — чтобы тултип единицы вылезал за карточку. Имя клипается
        // собственным line-clamp, так что содержимое всё равно не расползается.
        cursor: 'pointer', overflow: 'visible',
      }}
    >
      {HANDLES.flatMap(([sid, tid, pos]) => [
        <Handle key={sid} id={sid} type="source" position={pos} />,
        <Handle key={tid} id={tid} type="target" position={pos} />,
      ])}

      {/* Мета-полка: роль слева, чип «Ключевая» + единица справа */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 22 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: rs.color, flex: '0 0 auto' }} />
          <span style={{
            fontFamily: "'IBM Plex Mono', monospace", fontSize: 9.5, fontWeight: 600,
            letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--jm-faint)', whiteSpace: 'nowrap',
          }}>{rs.label}</span>
        </span>
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, flex: 'none' }}>
          {d.key && <KeyChip />}
          <UnitIcon units={d.units} />
        </span>
      </div>

      {/* Имя — прижато к нижнему краю */}
      <div style={{
        marginTop: 'auto', fontWeight: 600, fontSize: 14.5, lineHeight: 1.2, color: 'var(--jm-ink)',
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', paddingRight: 2,
      }}>{d.name}</div>
    </div>
  )
}

export const MetricNode = memo(MetricNodeBase)
