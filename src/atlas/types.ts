// Типы Базы атласа (data/atlas_base.json). Берём атлас «как есть».

export type Role = 'action' | 'cost' | 'result' | 'diagnostic' | string

export interface AtlasNode {
  id: string
  name: string
  section: string
  role: Role
  x: number; y: number; w: number; h: number; cx: number; cy: number
  formula: string
  description: string
  units: string
  key?: boolean
  group?: string
  content_src?: string
}

export interface AtlasEdge {
  source: string
  target: string
  sign: '+' | '-'
  style: 'solid' | 'dashed'
  kind: 'influence' | 'associative'
  cross_section: boolean
  // Ломаная коннектора В ИСХОДНЫХ координатах Miro (обход аффинных трансформов SVG,
  // ориентирована source→target). Есть у 751/756 рёбер. buildMap укладывает её в
  // текущую раскладку и отдаёт как `pts`; рёбра без неё идут в фолбэк-роутер.
  points?: number[][]
}

export interface AtlasSection {
  name: string
  slug: string
  nodes: number
}

export interface AtlasBase {
  meta: Record<string, unknown>
  sections: AtlasSection[]
  nodes: AtlasNode[]
  edges: AtlasEdge[]
}

// ── Отраслевые семейства для каталога (28 карт → 6 групп) ──
export interface Family {
  key: string
  title: string
  blurb: string
  accent: string      // токен-цвет семейства
  sections: string[]  // нормализованные имена карт
}
