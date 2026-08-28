// Дерево драйверов из Базы: кто чей ребёнок, чем входит в родителя и к какой
// модели бизнеса относится. Данные те же, что у карт (BASE.nodes / BASE.edges),
// отличие в том, что у дерева нет авторских координат — их считает layout.ts.
import { BASE } from '../atlas/atlas'
import type { AtlasNode, AtlasEdge, TreeInfo } from '../atlas/types'
import type { TreeSpec, TreeComp, TreeKid } from './layout'

export interface TreeNode extends AtlasNode {
  parent?: string
  sign: string
  kids: string[]
  /** сколько метрик лежит ниже, с разбивкой по группам — счётчик «+ N» */
  below: Record<string, number>
}

// ── Профиль бизнеса ──────────────────────────────────────────────────────────
// Метрики групп «ЕСЛИ …» относятся не ко всем: у розницы нет сессий сайта,
// у услуг — закупочной стоимости товара. Оси три, выбор по каждой запоминается:
// модель бизнеса у человека одна, спрашивать её на каждой ветке незачем.
export interface Axis { key: string; label: string; all: string; opts: string[] }

export const AXES: Axis[] = [
  { key: 'channel', label: 'Канал продаж', all: 'все каналы',
    opts: ['ЕСЛИ ПРОДАЁТЕ ОНЛАЙН', 'ЕСЛИ ПРОДАЁТЕ ОФЛАЙН',
           'ЕСЛИ ПРОДАЁТЕ ЧЕРЕЗ ОТДЕЛ ПРОДАЖ', 'ЕСЛИ РАБОТАЕТЕ ПО ПОДПИСКЕ'] },
  { key: 'cogs', label: 'Что продаёте', all: 'всё',
    opts: ['ЕСЛИ ПЕРЕПРОДАЁТЕ ТОВАР', 'ЕСЛИ ПРОИЗВОДИТЕ', 'ЕСЛИ ОКАЗЫВАЕТЕ УСЛУГИ'] },
  { key: 'tax', label: 'Налоги', all: 'любые',
    opts: ['ЕСЛИ НА ОСНО', 'ЕСЛИ НА УСН', 'ЕСЛИ НА ПАТЕНТЕ ИЛИ АУСН'] },
]

export const SHORT: Record<string, string> = {
  'ЕСЛИ ПРОДАЁТЕ ОНЛАЙН': 'онлайн',
  'ЕСЛИ ПРОДАЁТЕ ОФЛАЙН': 'офлайн',
  'ЕСЛИ ПРОДАЁТЕ ЧЕРЕЗ ОТДЕЛ ПРОДАЖ': 'отдел продаж',
  'ЕСЛИ РАБОТАЕТЕ ПО ПОДПИСКЕ': 'подписка',
  'ЕСЛИ ПЕРЕПРОДАЁТЕ ТОВАР': 'перепродажа',
  'ЕСЛИ ПРОИЗВОДИТЕ': 'производство',
  'ЕСЛИ ОКАЗЫВАЕТЕ УСЛУГИ': 'услуги',
  'ЕСЛИ НА ОСНО': 'ОСНО',
  'ЕСЛИ НА УСН': 'УСН',
  'ЕСЛИ НА ПАТЕНТЕ ИЛИ АУСН': 'патент или АУСН',
  'ОБЩЕЕ ДЛЯ ВСЕХ': 'общее для всех',
}

export const ALL_GROUP = 'ОБЩЕЕ ДЛЯ ВСЕХ'

/** Выбранные модели по каждой оси. Моделей может быть несколько сразу: компания
 *  торгует и офлайн, и онлайн — тогда в дереве видны обе ветки, каждая своей
 *  группой. Пустой список по оси — показываем всё. */
export type Profile = Record<string, string[]>

export function axisOf(group?: string): Axis | undefined {
  if (!group || group === ALL_GROUP) return undefined
  return AXES.find((a) => a.opts.includes(group))
}

/** Метрика подходит профилю: она общая или её модель выбрана. */
export function keepGroup(group: string | undefined, profile: Profile): boolean {
  const ax = axisOf(group)
  if (!ax) return true
  const picked = profile[ax.key] ?? []
  return picked.length === 0 || picked.includes(group!)
}

// ── Сборка дерева ────────────────────────────────────────────────────────────

export interface Tree {
  info: TreeInfo
  nodes: Map<string, TreeNode>
  root: string
}

const cache = new Map<string, Tree>()

export function treeBySlug(slug: string): Tree | undefined {
  const cached = cache.get(slug)
  if (cached) return cached
  const info = (BASE.trees ?? []).find((t) => t.slug === slug)
  if (!info) return undefined

  const nodes = new Map<string, TreeNode>()
  BASE.nodes.forEach((n: AtlasNode) => {
    if (n.section !== info.name) return
    nodes.set(n.id, { ...n, sign: '+', kids: [], below: {} })
  })
  BASE.edges.forEach((e: AtlasEdge) => {
    const kid = nodes.get(e.source), par = nodes.get(e.target)
    if (!kid || !par || e.kind === 'similarity') return
    kid.parent = e.target
    kid.sign = e.sign || '+'
    par.kids.push(e.source)
  })

  // порядок детей: доходные выше расходных, внутри — как автор разложила дерево
  // (координата Y снята с доски); метрики без Y идут следом, в порядке Базы
  const order = new Map<string, number>()
  BASE.nodes.forEach((n, i) => order.set(n.id, i))
  nodes.forEach((n) => {
    n.kids.sort((a, b) => {
      const A = nodes.get(a)!, B = nodes.get(b)!
      if ((A.sign === '-') !== (B.sign === '-')) return A.sign === '-' ? 1 : -1
      const ay = A.y ?? Infinity, by = B.y ?? Infinity
      if (ay !== by) return ay - by
      return (order.get(a) ?? 0) - (order.get(b) ?? 0)
    })
  })

  // сколько метрик ниже узла, с разбивкой по группам: профиль выбирают уже
  // на экране, и счётчик показывает то, что под ним останется
  const fill = (id: string): Record<string, number> => {
    const n = nodes.get(id)!
    if (Object.keys(n.below).length) return n.below
    const acc: Record<string, number> = {}
    n.kids.forEach((k) => {
      const kid = nodes.get(k)!
      const g = kid.group || ''
      acc[g] = (acc[g] || 0) + 1
      const sub = fill(k)
      Object.keys(sub).forEach((gg) => { acc[gg] = (acc[gg] || 0) + sub[gg] })
    })
    n.below = acc
    return acc
  }
  const root = info.root ?? [...nodes.values()].find((n) => !n.parent)?.id
  if (!root) return undefined
  fill(root)

  const tree: Tree = { info, nodes, root }
  cache.set(slug, tree)
  return tree
}

/** Счётчик под метрикой при нынешнем профиле. */
export function totalOf(n: TreeNode, profile: Profile): number {
  return Object.keys(n.below).reduce(
    (a, g) => a + (keepGroup(g || undefined, profile) ? n.below[g] : 0), 0)
}

const kidOf = (t: Tree, id: string, profile: Profile): TreeKid => {
  const n = t.nodes.get(id)!
  // Счётчик на чипе — размер ветки целиком, со всеми моделями бизнеса, а не при
  // нынешнем профиле. Модель выбирается уже внутри ветки, и на холсте уровнем выше
  // о ней ничего не сказано: отфильтрованное число читалось бы как общее и врало.
  // У «Выручки» это 30, а не 8 по одному каналу продаж.
  const ALL: Profile = {}
  const total = childSize(t, id, ALL) || totalOf(n, ALL)
  return { name: n.name, role: n.role, units: n.units || '', sign: n.sign,
           group: n.group, total }
}

/**
 * Три ступени от узла: он сам → его дети → их дети.
 * Пока модель бизнеса не выбрана, показываются все метрики: рамка модели
 * подписывает их в колонке, а не прячет за карточкой выбора. Раньше прямые
 * дети корня подменялись заглушкой «выберите модель», и правило расходилось
 * само с собой: у внуков та же рамка метрику показывала.
 */
export function specOf(t: Tree, id: string, profile: Profile): TreeSpec {
  const n = t.nodes.get(id)!
  const comps: TreeComp[] = []

  n.kids.forEach((k) => {
    const kid = t.nodes.get(k)!
    if (!keepGroup(kid.group, profile)) return
    comps.push({
      ...kidOf(t, k, profile),
      kids: kid.kids.filter((g) => keepGroup(t.nodes.get(g)!.group, profile))
        .map((g) => kidOf(t, g, profile)),
    })
  })

  // Метрики одной модели идут подряд — так их можно обвести общей рамкой.
  comps.sort((a, b) => (a.group ?? '').localeCompare(b.group ?? ''))
  return { name: n.name, role: n.role, units: n.units || '', key: !!n.key, comps }
}

/** Дерево, в котором эта метрика — ключевая. Из дерева прибыли по такой связи
 *  проваливаются в дерево выручки: это разные артефакты, а не поддерево. */
export function childTree(t: Tree, id: string): TreeInfo | undefined {
  const n = t.nodes.get(id)
  if (!n) return undefined
  return (BASE.trees ?? []).find((x) => x.parent === t.info.slug && x.name === n.name)
}

/** Сколько метрик лежит в дочернем дереве — число на чипе «+ N». */
export function childSize(t: Tree, id: string, profile: Profile): number {
  const info = childTree(t, id)
  if (!info) return 0
  const sub = treeBySlug(info.slug)
  if (!sub) return 0
  return [...sub.nodes.values()]
    .filter((n) => n.id !== sub.root && keepGroup(n.group, profile)).length
}

/** Узел, под которым есть ещё ступень: у него на карточке чип «+ N». */
export function canDrill(t: Tree, id: string, profile: Profile): boolean {
  const n = t.nodes.get(id)
  return !!n && n.kids.length > 0 && totalOf(n, profile) > 0
}

export function nodeByName(t: Tree, name: string): TreeNode | undefined {
  for (const n of t.nodes.values()) if (n.name === name) return n
  return undefined
}
