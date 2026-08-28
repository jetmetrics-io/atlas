// Типы Базы атласа (data/atlas_base.json). Берём атлас «как есть».

export type Role = 'action' | 'cost' | 'result' | 'diagnostic' | string

export interface AtlasNode {
  id: string
  /** id самой метрики: у одной метрики может быть несколько мест (карта и дерево),
   *  и по mid они узнаются друг в друге. */
  mid?: number
  name: string
  section: string
  role: Role
  // Авторские координаты есть у карт; у деревьев их нет — там y хранит порядок
  // ветки, а раскладку считает src/tree/layout.ts.
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
  kind: 'influence' | 'associative' | 'similarity'
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

// Дерево драйверов: артефакт рядом с картами, но без авторских координат —
// раскладку считает src/tree/layout.ts от корня.
export interface TreeInfo {
  name: string
  slug: string
  nodes: number
  /** Метрик во всём разборе: дерево вместе со всеми, что открываются провалом
   *  из него. У дерева без детей совпадает с nodes. */
  total?: number
  root?: string
  purpose?: string
  /** Дерево, из которого в него проваливаются: ключевая метрика этого дерева
   *  стоит там драйвером. У дерева верхнего уровня пусто. */
  parent?: string | null
}

export interface AtlasBase {
  meta: Record<string, unknown>
  families?: Family[]
  trees?: TreeInfo[]
  sections: AtlasSection[]
  nodes: AtlasNode[]
  edges: AtlasEdge[]
}

// ── Группы каталога. Приходят из базы (families в atlas_*.json), в коде не заданы:
// состав групп — свойство Атласа, а не приложения. В группе лежат и карты, и деревья. ──
export interface FamilyItem {
  name: string
  slug: string
  type: 'map' | 'tree'
  access: 'free' | 'paid' | null
  nodes: number       // метрик в самом артефакте
  total?: number      // у дерева — метрик во всём разборе, вместе с провалами
}

export interface Family {
  key: string
  title: string
  blurb: string
  accent: string      // токен-цвет группы
  items: FamilyItem[]
}
