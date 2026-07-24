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

// Все 28 карт → slug отдельной страницы Тильды. Имя карты (как в Базе) → slug.
// Все страницы встраивают ОДНУ сборку Атласа; бесплатные карты (finansy/lidogeneraciya/
// podderzhka) — на публичных страницах, остальные — под Tilda Members. Что реально
// откроется, решает гейт внутри приложения (оплата), а не адрес страницы.
const MAP_PAGES: Record<string, string> = {
  'Финансы': 'finansy',
  'Лидогенерация': 'lidogeneraciya',
  'Поддержка клиентов': 'podderzhka',
  'SaaS продукты': 'saas',
  'Ассортимент': 'assortiment',
  'Контент-маркетинг': 'kontent-marketing',
  'Маркетплейсы': 'marketpleysy',
  'CRM': 'crm',
  'Онлайн-обучение': 'onlayn-obuchenie',
  'Управление запасами': 'upravlenie-zapasami',
  'Ритейл': 'riteyl',
  'Медийная реклама': 'mediynaya-reklama',
  'Заказы': 'zakazy',
  'HR': 'hr',
  'Программа лояльности': 'programma-loyalnosti',
  'Поисковая реклама': 'poiskovaya-reklama',
  'Обработка заказов': 'obrabotka-zakazov',
  'B2B продажи': 'b2b-prodazhi',
  'E-​mail маркетинг': 'email-marketing',
  'Воронка электронной коммерции': 'voronka-ecommerce',
  'Работа с инфлюенсерами': 'influensery',
  'Возвраты товара': 'vozvraty',
  'Доставка заказов': 'dostavka-zakazov',
  'Сайт': 'sayt',
  'Оформление заказа': 'oformlenie-zakaza',
  'SEO': 'seo',
  'Приложение': 'prilozhenie',
  'Реферальная программа': 'referalnaya-programma',
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
