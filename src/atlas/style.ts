// Роль метрики → цвет/подпись (по бренд-системе). Знак связи → цвет.
import type { Role } from './types'

export interface RoleStyle { color: string; text: string; tint: string; label: string }

export const ROLE: Record<string, RoleStyle> = {
  result:     { color: '#0E9C7D', text: '#0B7D64', tint: '#E3F5F0', label: 'Результат' },
  action:     { color: '#4991FF', text: '#357EF0', tint: '#EAF2FF', label: 'Действие' },
  cost:       { color: '#FF5C60', text: '#DC4048', tint: '#FDE9EA', label: 'Затраты' },
  diagnostic: { color: '#FFC700', text: '#A07A00', tint: '#FFF4D6', label: 'Диагностика' },
}
export const ROLE_DEFAULT: RoleStyle = { color: '#98A0A6', text: '#6B7372', tint: '#EEF1F3', label: 'Метрика' }

export function roleStyle(role: Role): RoleStyle {
  return ROLE[role] ?? ROLE_DEFAULT
}

// Знак связи → цвет
export const GREEN = '#0E9C7D'
export const CORAL = '#FF5C60'
export function signColor(sign: '+' | '-') { return sign === '+' ? GREEN : CORAL }

export function edgeLabel(sign: '+' | '-', kind: 'influence' | 'associative') {
  const dir = sign === '+' ? 'Прямая' : 'Обратная'
  return kind === 'influence' ? `${dir} — влияние` : `${dir} — связь без влияния`
}
export function edgeMeaning(sign: '+' | '-', kind: 'influence' | 'associative') {
  const s = sign === '+' ? 'растёт' : 'падает'
  if (kind === 'influence')
    return `Когда первый показатель растёт, второй ${s}. Это влияние: на первый можно нажать, чтобы сдвинуть второй.`
  return `Показатели меняются вместе (второй ${s}), но это не причина, а связь. Двигать первый, чтобы поднять второй, не сработает.`
}
