// Типы графа по грамматике (13_grammar.md). Демо-датасет — demo.ts.

export type QuantityType = 'count' | 'money' | 'ratio' | 'percent' | 'per_unit' | 'score' | 'duration'
export type Additivity = 'ext' | 'int' // extensive (складывается) / intensive (нет)
export type Essence = 'more_better' | 'less_better' | 'band'
export type Controllability = 'lever' | 'semi' | 'result'
export type RoleDefault = 'diagnostic' | 'cost' | 'result' | 'actionable' | 'guardrail'
export type GoodhartRisk = 'low' | 'high'
// Ярус детализации на КАРТЕ: 1 = верхнеуровневое табло (≤10), 2 = механика, 3 = всё
export type MapTier = 1 | 2 | 3

export type EdgeKind = 'identity' | 'influence' | 'associative'
export type EdgeSign = '+' | '-' | 'conditional' | 'n/a'
export type IdentityOp = 'factor' | 'term' | 'subtrahend' | 'stage' // × / + / − / ×CR

export interface GraphNode {
  id: string
  ru: string
  en: string
  section: string
  quantity_type: QuantityType
  additivity: Additivity
  essence: Essence
  grain: string
  controllability: Controllability
  goodhart_risk: GoodhartRisk
  role_default: RoleDefault
  tier?: MapTier // ярус детализации на карте (для LOD-переключения)
  formula?: string
  description?: string
  why?: string
}

export interface GraphEdge {
  source: string
  target: string
  kind: EdgeKind
  sign: EdgeSign
  op?: IdentityOp // для тождеств
  mechanism?: string // для влияний (обязателен по WF6)
  flip?: string // что переворачивает знак (WF8)
  strength: 'weak' | 'medium' | 'strong'
  confidence: 'low' | 'medium' | 'high'
  provenance: 'curated' | 'draft'
}

export interface Graph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

/** Контекстная роль в текущем виде — выводится относительно фокуса (R4). */
export type ContextRole = 'driver' | 'focus' | 'outcome'
