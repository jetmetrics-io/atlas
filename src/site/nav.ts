// Навигация между страницами Тильды (вариант «каждая карта — своя страница»).
// Приложение встроено в Тильду через iframe; при клике по карте уводим ВЕРХНЕЕ окно
// на отдельную страницу этой карты, а «назад» — обратно на страницу каталога.

export const EMBED =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('embed') === '1'

const SITE = 'https://джетметрикс.рф'

// Страница каталога и страница покупки полного доступа.
export const CATALOG_PAGE = `${SITE}/hub-atlas`
export const BUY_URL = `${SITE}/atlas`

// Карты, у которых есть отдельная страница на Тильде. Ключ — имя карты, значение —
// slug страницы. Дополняется по мере создания страниц (сейчас — 3 бесплатные).
const MAP_PAGES: Record<string, string> = {
  'Финансы': 'finansy',
  'Лидогенерация': 'lidogeneraciya',
  'Поддержка клиентов': 'podderzhka',
}

// Адрес страницы карты на Тильде, либо null если отдельной страницы у карты нет
// (тогда карта открывается внутри приложения, как раньше).
export function mapPageUrl(name: string): string | null {
  const slug = MAP_PAGES[name]
  return slug ? `${SITE}/hub-atlas-${slug}` : null
}

// Перевести ВЕРХНЕЕ окно (мы внутри iframe на Тильде) на другой адрес.
export function goTop(url: string) {
  try {
    if (window.top && window.top !== window.self) { window.top.location.href = url; return }
  } catch { /* cross-origin: читать нельзя, но навигация ниже сработает */ }
  window.location.href = url
}
