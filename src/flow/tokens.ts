// Токены дизайна «стиль 10-5» (канон: prototype/design/DESIGN.md).
import type { ContextRole, Controllability, EdgeKind } from '../graph/types'

export const TOKENS = {
  bg: '#fbfdfe',
  grid: '#e4eaf1',
  card: '#ffffff',
  text: '#1f2a37',
  muted: '#8a97a6',
  border: '#d4dde6',
  fontUI: "'IBM Plex Sans', sans-serif",
  fontMono: "'IBM Plex Mono', monospace",
}

export const ROLE_COLOR: Record<ContextRole, string> = {
  driver: '#4991FF',
  focus: '#0E9C7D',
  outcome: '#9370DB',
}
export const ROLE_LABEL: Record<ContextRole, string> = {
  driver: 'драйвер',
  focus: 'фокус',
  outcome: 'исход',
}

// Управляемость
export const CTRL_LABEL: Record<Controllability, string> = { lever: 'рычаг', semi: 'косвенный рычаг', result: 'результат' }
// рычаг = синий (крутишь напрямую), косвенный = фиолетовый (влияешь через другое), результат = зелёный (цель/исход)
export const CTRL_COLOR: Record<Controllability, string> = { lever: '#4991FF', semi: '#9370DB', result: '#0E9C7D' }

// Рёбра
export const INFLUENCE_POS = '#0E9C7D'
export const INFLUENCE_NEG = '#FF5C60'
export const INFLUENCE_COND = '#F5A623'
export const IDENTITY_COL = '#FFC700'
export const ASSOC_COL = '#8a97a6'

// Оператор тождества → знак арифметики (НЕ причинность): вычитаемое −, слагаемое +, множитель ×, стадия ×CR
const OP_LABEL: Record<string, string> = { subtrahend: '−', term: '+', factor: '×', stage: '×CR' }

// Ключевое различение (ICP-панель P1): тождество = арифметика БЕЗ стрелки (гео-отличие), влияние = причинная СТРЕЛКА.
export function edgeVisual(kind: EdgeKind, sign: string, op?: string) {
  if (kind === 'identity') return { color: IDENTITY_COL, label: op ? OP_LABEL[op] ?? '=' : '=', dashed: false, arrow: false, identity: true }
  if (kind === 'associative') return { color: ASSOC_COL, label: '~', dashed: true, arrow: false, identity: false }
  if (sign === '+') return { color: INFLUENCE_POS, label: '+', dashed: false, arrow: true, identity: false }
  if (sign === '-') return { color: INFLUENCE_NEG, label: '−', dashed: false, arrow: true, identity: false }
  if (sign === 'conditional') return { color: INFLUENCE_COND, label: '±', dashed: false, arrow: true, identity: false }
  return { color: INFLUENCE_POS, label: '→', dashed: false, arrow: true, identity: false }
}

export const KIND_LABEL: Record<EdgeKind, string> = {
  identity: 'тождество',
  influence: 'влияние',
  associative: 'ассоциация',
}

export const NODE_W = 210
export const NODE_H = 80
