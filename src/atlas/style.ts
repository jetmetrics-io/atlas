// Роль метрики → цвет/подпись (по бренд-системе). Знак связи → цвет.
import type { AtlasEdge } from './types'
import type { Role } from './types'
import { t } from '../i18n'

export interface RoleStyle { color: string; text: string; tint: string; label: string }

// Роль принадлежит МЕСТУ метрики, а не самой метрике: на карте «Выручка» —
// результат, в дереве прибыли она драйвер, а в своём дереве — ключевая.
// Поэтому ролей два набора: у карт свои, у деревьев ступени.
export const ROLE: Record<string, RoleStyle> = {
  result:     { color: '#0E9C7D', text: '#0B7D64', tint: '#E3F5F0', label: t('Результат') },
  action:     { color: '#4991FF', text: '#357EF0', tint: '#EAF2FF', label: t('Действие') },
  cost:       { color: '#FF5C60', text: '#DC4048', tint: '#FDE9EA', label: t('Затраты') },
  diagnostic: { color: '#FFC700', text: '#A07A00', tint: '#FFF4D6', label: t('Диагностика') },
  // ступени дерева — цвета те же, что у заголовков колонок
  key:        { color: '#0E9C7D', text: '#0B7259', tint: '#E3F5F0', label: t('Ключевая метрика') },
  component:  { color: '#E0A800', text: '#8A6905', tint: '#FFF4D6', label: t('Компонент') },
  driver:     { color: '#4991FF', text: '#2D62BC', tint: '#EAF2FF', label: t('Драйвер') },
}
export const ROLE_DEFAULT: RoleStyle = { color: '#98A0A6', text: '#6B7372', tint: '#EEF1F3', label: t('Метрика') }

export function roleStyle(role: Role): RoleStyle {
  return ROLE[role] ?? ROLE_DEFAULT
}

// Знак связи → цвет
export const GREEN = '#0E9C7D'
export const CORAL = '#FF5C60'
export function signColor(sign: '+' | '-') { return sign === '+' ? GREEN : CORAL }

export function edgeLabel(sign: '+' | '-', kind: AtlasEdge['kind']) {
  const dir = sign === '+' ? t('Прямая') : t('Обратная')
  return kind === 'influence' ? t('{dir} — влияние', { dir }) : t('{dir} — связь без влияния', { dir })
}
export function edgeMeaning(sign: '+' | '-', kind: AtlasEdge['kind']) {
  const s = sign === '+' ? t('растёт') : t('падает')
  if (kind === 'influence')
    return t('Когда первый показатель растёт, второй {s}. Это влияние: на первый можно нажать, чтобы сдвинуть второй.', { s })
  return t('Показатели меняются вместе (второй {s}), но это не причина, а связь. Двигать первый, чтобы поднять второй, не сработает.', { s })
}
