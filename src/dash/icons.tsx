// Иконки типов листа и значок подсказки. Только SVG на currentColor — эмодзи не используем:
// они разные в каждой ОС и читаются как украшение, а не как обозначение типа.
import type { SheetType } from './blueprints'

export function TypeIcon({ type, size = 16 }: { type: SheetType; size?: number }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      {type === 'diag' && (
        // лупа над линией тренда: смотрим внутрь уже случившегося
        <g {...p}>
          <circle cx="8.6" cy="8.6" r="5" />
          <path d="M12.3 12.3 16.5 16.5" />
          <path d="M6.4 9.6 8.2 7.4 9.8 9 11 6.6" />
        </g>
      )}
      {type === 'ops' && (
        // пульс: то, что идёт прямо сейчас
        <g {...p}>
          <path d="M2.5 10.5h3l2-4.6 2.8 8.2 2-3.6h4.2" />
        </g>
      )}
      {type === 'probe' && (
        // колба: разовая проверка гипотезы, лист после неё не остаётся
        <g {...p}>
          <path d="M8 2.6v4.9L4 14.3a1.6 1.6 0 0 0 1.4 2.4h9.2a1.6 1.6 0 0 0 1.4-2.4L12 7.5V2.6" />
          <path d="M7 2.6h6" />
          <path d="M6.2 12.4h7.6" />
        </g>
      )}
    </svg>
  )
}

// Значок подсказки. Стоит отдельной мишенью, чтобы объяснение не выскакивало
// от случайного наведения на плитку.
export function InfoIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6.4" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="8" cy="5.2" r="0.95" fill="currentColor" />
      <path d="M8 7.4v4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}
