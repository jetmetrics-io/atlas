import { BASE } from '../atlas/atlas'

// Навигация между страницами Тильды (вариант «каждая карта — своя страница»).
// Приложение встроено в Тильду через iframe; при клике по карте уводим ВЕРХНЕЕ окно
// на отдельную страницу этой карты, а «назад» — обратно на страницу каталога.

export const EMBED =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('embed') === '1'

const SITE = 'https://джетметрикс.рф'

// Один адрес каталога Атласа: сборка одна, гейт — внутри приложения по факту оплаты.
// «Назад» с любой карты ведёт сюда; что покажется (3 или 28 карт) решает уже сам Атлас.
export const CATALOG_PAGE = `${SITE}/hub-atlas`
export const BUY_URL = `${SITE}/atlas`

// Адрес страницы карты на Тильде собирается из slug'а карты в Базе: `hub-atlas-<slug>`.
// Все страницы встраивают ОДНУ сборку Атласа; бесплатные карты (finansy/lidogeneraciya/
// podderzhka) — на публичных страницах, остальные — под Tilda Members. Что реально
// откроется, решает гейт внутри приложения (оплата), а не адрес страницы.
//
// Раньше здесь лежал словарь «имя карты → slug страницы» на 28 строк, и он расходился
// со slug'ами Базы у 17 карт. Связка шла по названию карты, поэтому переименование
// молча ломало адрес. 26.08.2026 slug'и Базы приведены к адресам страниц, словарь убран.
export function mapPageUrl(name: string): string | null {
  const slug = BASE.sections.find((s) => s.name === name)?.slug
  return slug ? `${SITE}/hub-atlas-${slug}` : null
}

/** Страница Тильды, на которой живут ВСЕ девять деревьев. Заведена одна: страница —
 *  оболочка с iframe, а какое дерево открыть, решает параметр `?tree=`. Собирать адрес
 *  как `/hub-atlas-<слаг дерева>` нельзя: у восьми деревьев такой страницы нет, и ссылка
 *  на метрику соседнего дерева давала 404. Появятся отдельные страницы — список сюда. */
const TREE_PAGES = new Set(['chistaya-pribyl'])
const TREE_SHELL = 'chistaya-pribyl'

/** Адрес страницы артефакта на сайте: у дерева она такая же, как у 28 карт,
 *  только внутри приложение открывается по ?tree=, а не по ?map=. */
export function artifactPageUrl(name: string): string | null {
  const map = mapPageUrl(name)
  if (map) return map
  const tree = (BASE.trees ?? []).find((t) => t.name === name)
  if (!tree) return null
  const page = TREE_PAGES.has(tree.slug) ? tree.slug : TREE_SHELL
  return `${SITE}/hub-atlas-${page}?tree=${tree.slug}`
}

/** Открыть дерево: на сайте — его страница Тильды, локально — свой же адрес с ?tree=.
 *  Внутри iframe уводим ВЕРХНЕЕ окно, иначе дерево откроется внутри рамки карты. */
/** Открыть дерево. `newTab` — когда уходим из другого артефакта (с карты): там дерево
 *  это отдельная сущность, и терять карту, с которой пришли, читатель не должен.
 *  Внутри самого разбора переход идёт на месте: девять деревьев там читаются как одно. */
export function openTree(slug: string, nodeId?: string, newTab = false) {
  const page = artifactPageUrl((BASE.trees ?? []).find((t) => t.slug === slug)?.name ?? '')
  const node = nodeId ? `&node=${encodeURIComponent(nodeId)}` : ''
  if (page && newTab) { window.open(page + node, '_blank', 'noopener'); return }
  if (EMBED && page) { goTop(page + node); return }
  window.location.href = `${window.location.pathname}?tree=${slug}${node}`
}

/** Адрес метрики в её артефакте: страница артефакта + ?node=. У дерева адрес
 *  уже несёт ?tree=, поэтому метрика присоединяется через «&». Без страницы на
 *  сайте (локальная сборка) собираем внутренний адрес приложения. */
export function metricUrl(section: string, nodeId: string): string {
  const tree = (BASE.trees ?? []).find((t) => t.name === section)
  const page = artifactPageUrl(section)
  if (page) return `${page}${tree ? '&' : '?'}node=${nodeId}`
  const local = tree
    ? `?tree=${tree.slug}&node=${nodeId}`
    : `?map=${encodeURIComponent(section)}&node=${nodeId}`
  return `${window.location.pathname}${local}`
}

// Перевести ВЕРХНЕЕ окно (мы внутри iframe на Тильде) на другой адрес.
export function goTop(url: string) {
  try {
    if (window.top && window.top !== window.self) { window.top.location.href = url; return }
  } catch { /* cross-origin: читать нельзя, но навигация ниже сработает */ }
  window.location.href = url
}
