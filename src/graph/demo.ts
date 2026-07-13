import type { Graph } from './types'

// ЭТАЛОННЫЙ ДЕМО-ГРАФ — собран строго по грамматике (13_grammar.md).
// Демонстрирует: 3 модальности связи, знаки, механизмы, flip-условия,
// градиент управляемости (lever/semi/result), goodhart-риск, тождества-стадии.
// Не еком-«лицо» продукта — учебный набор, где всё размечено правильно.

const N = (
  id: string, ru: string, en: string, section: string,
  quantity_type: any, additivity: any, essence: any, grain: string,
  controllability: any, goodhart_risk: any, role_default: any,
  formula?: string, why?: string,
) => ({ id, ru, en, section, quantity_type, additivity, essence, grain, controllability, goodhart_risk, role_default, formula, why })

export const DEMO: Graph = {
  nodes: [
    // — Рычаги (lever): то, что ставят действием напрямую —
    N('ad_spend', 'Рекламный бюджет', 'Ad Spend', 'Маркетинг', 'money', 'ext', 'band', 'период', 'lever', 'low', 'actionable', undefined, 'Прямой рычаг: сколько вложить в трафик.'),
    N('discount', 'Глубина скидки', 'Discount Depth', 'Маркетинг', 'percent', 'int', 'band', 'заказ', 'lever', 'high', 'actionable', undefined, 'Рычаг спроса с обратной стороной по марже.'),
    N('price', 'Цена', 'Price', 'Ассортимент', 'money', 'int', 'band', 'товар', 'lever', 'high', 'actionable', undefined, 'Рычаг, влияющий и на средний чек, и на конверсию.'),
    N('pdp_quality', 'Качество карточки', 'PDP Quality', 'Сайт', 'score', 'int', 'more_better', 'карточка', 'lever', 'low', 'actionable', undefined, 'Фото, описание, отзывы — двигает конверсию.'),
    N('page_speed', 'Время загрузки', 'Page Load Time', 'Сайт', 'duration', 'int', 'less_better', 'страница', 'lever', 'low', 'actionable', undefined, 'Медленная загрузка режет конверсию.'),

    // — Воронка: объёмы (стадии) —
    N('sessions', 'Сессии', 'Sessions', 'Сайт', 'count', 'ext', 'more_better', 'сессия', 'semi', 'low', 'diagnostic', undefined, 'Вход воронки.'),
    N('product_views', 'Просмотры карточек', 'Product Views', 'Сайт', 'count', 'ext', 'more_better', 'сессия', 'semi', 'low', 'diagnostic', 'Сессии × CR сессия→карточка'),
    N('add_cart', 'Добавления в корзину', 'Add-to-Cart', 'Оформление', 'count', 'ext', 'more_better', 'сессия', 'semi', 'low', 'diagnostic', 'Просмотры карточек × CR карточка→корзина'),
    N('orders', 'Заказы', 'Orders', 'Заказы', 'count', 'ext', 'more_better', 'период', 'result', 'low', 'result', 'Добавления в корзину × CR корзина→заказ'),

    // — Воронка: конверсии (множители-стадии, тут сидит причинность) —
    N('cr_view', 'CR сессия→карточка', 'Session→PDP CR', 'Сайт', 'percent', 'int', 'more_better', '/сессия', 'semi', 'high', 'diagnostic', 'Просмотры карточек / Сессии'),
    N('cr_cart', 'CR карточка→корзина', 'PDP→Cart CR', 'Оформление', 'percent', 'int', 'more_better', '/просмотр', 'semi', 'high', 'diagnostic', 'Добавления / Просмотры карточек'),
    N('checkout_cr', 'CR корзина→заказ', 'Checkout CR', 'Оформление', 'percent', 'int', 'more_better', '/корзина', 'semi', 'high', 'diagnostic', 'Заказы / Добавления в корзину'),
    N('cr_order', 'Конверсия в заказ', 'Overall CR', 'Заказы', 'percent', 'int', 'more_better', '/сессия', 'semi', 'high', 'diagnostic', 'Заказы / Сессии (сквозная)'),

    // — Деньги —
    N('aov', 'Средний чек', 'AOV', 'Финансы', 'money', 'int', 'more_better', '/заказ', 'semi', 'high', 'result', 'Выручка / Заказы'),
    N('revenue', 'Выручка', 'Revenue', 'Финансы', 'money', 'ext', 'more_better', 'период', 'result', 'low', 'result', 'Заказы × Средний чек'),
    N('cost', 'Затраты', 'Cost', 'Финансы', 'money', 'ext', 'less_better', 'период', 'semi', 'low', 'cost', 'Реклама + себестоимость + операционные'),
    N('profit', 'Прибыль', 'Profit', 'Финансы', 'money', 'ext', 'more_better', 'период', 'result', 'low', 'result', 'Выручка − Затраты'),
    N('margin', 'Маржинальность', 'Gross Margin', 'Финансы', 'percent', 'int', 'more_better', 'период', 'semi', 'high', 'guardrail', '(Выручка − COGS) / Выручка', 'Guardrail: рычаги спроса часто её роняют.'),

    // — Поведение / guardrails / контекст —
    N('bounce_rate', 'Показатель отказов', 'Bounce Rate', 'Сайт', 'percent', 'int', 'less_better', '/сессия', 'semi', 'high', 'diagnostic', undefined),
    N('returns', 'Возвраты', 'Returns', 'Возвраты', 'count', 'ext', 'less_better', 'период', 'semi', 'low', 'diagnostic', undefined),
    N('return_rate', 'Доля возвратов', 'Return Rate', 'Возвраты', 'percent', 'int', 'less_better', '/заказ', 'semi', 'high', 'guardrail', 'Возвраты / Заказы'),
  ],

  edges: [
    // ТОЖДЕСТВА-СТАДИИ (объём = пред. × конверсия)
    E('sessions', 'product_views', 'stage'), E('cr_view', 'product_views', 'stage'),
    E('product_views', 'add_cart', 'stage'), E('cr_cart', 'add_cart', 'stage'),
    E('add_cart', 'orders', 'stage'), E('checkout_cr', 'orders', 'stage'),
    // ТОЖДЕСТВА-ФАКТОРЫ (выручка = заказы × чек)
    E('orders', 'revenue', 'factor'), E('aov', 'revenue', 'factor'),
    // ТОЖДЕСТВА-НЕТТО (прибыль = выручка − затраты)
    Et('revenue', 'profit', 'term'), Et('cost', 'profit', 'subtrahend'),
    // ТОЖДЕСТВА прочие определения
    E('returns', 'return_rate', 'factor'), E('orders', 'return_rate', 'factor'),
    E('ad_spend', 'cost', 'term'),

    // ВЛИЯНИЯ (знак · механизм · flip)
    Inf('ad_spend', 'sessions', '+', 'больше бюджет → больше трафика', 'при насыщении аукциона рост замедляется (diminishing)', 'strong'),
    Inf('discount', 'orders', '+', 'скидка стимулирует покупки', 'приучает ждать распродаж → падает базовый спрос', 'medium'),
    Inf('discount', 'margin', '-', 'скидка режет маржу напрямую', undefined, 'strong'),
    Inf('price', 'aov', '+', 'выше цена → выше средний чек', 'эластичный спрос: объём падает сильнее, чем растёт чек', 'medium', 'conditional'),
    Inf('price', 'cr_cart', '-', 'выше цена → ниже конверсия в корзину', 'premium-сегмент: высокая цена = сигнал качества, знак +', 'medium', 'conditional'),
    Inf('pdp_quality', 'cr_cart', '+', 'качество карточки повышает конверсию', undefined, 'strong'),
    Inf('page_speed', 'cr_cart', '-', 'медленная загрузка → уходят, не добавляют', undefined, 'medium'),
    Inf('bounce_rate', 'cr_view', '-', 'отказы = не доходят до карточек', undefined, 'medium'),
    Inf('return_rate', 'margin', '-', 'возвраты съедают маржу (логистика, уценка)', undefined, 'medium'),
    Inf('return_rate', 'profit', '-', 'возвраты бьют по прибыли', undefined, 'medium'),

    // АССОЦИАЦИИ (без стрелки)
    As('sessions', 'cr_order', 'общий знаменатель — Сессии'),
    As('orders', 'cr_order', 'общий числитель — Заказы'),
    As('bounce_rate', 'page_speed', 'общая причина — плохой UX'),
    As('cr_view', 'cr_cart', 'обе — качество прохождения воронки'),
  ],
}

// ЯРУСЫ ДЕТАЛИЗАЦИИ КАРТЫ (LOD).
// tier 1 = бизнес-табло (≤10 верхнеуровневых), tier 2 = механика воронки, tier 3 = рычаги/сырьё.
// Позиции узлов на карте берутся из ПОЛНОГО набора (tier 3), поэтому при переключении
// уровня метрика не двигается — детали доращиваются вокруг стабильного скелета.
export const DEMO_TIERS: Record<string, 1 | 2 | 3> = {
  // — tier 1: табло —
  profit: 1, revenue: 1, cost: 1, orders: 1, aov: 1,
  sessions: 1, cr_order: 1, margin: 1, return_rate: 1,
  // — tier 2: механика воронки —
  product_views: 2, add_cart: 2, cr_view: 2, cr_cart: 2, checkout_cr: 2,
  returns: 2, bounce_rate: 2,
  // — tier 3: рычаги + сырьё —
  ad_spend: 3, discount: 3, price: 3, pdp_quality: 3, page_speed: 3,
}

function E(source: string, target: string, op: any) {
  return { source, target, kind: 'identity' as const, sign: '+' as const, op, strength: 'strong' as const, confidence: 'high' as const, provenance: 'curated' as const }
}
function Et(source: string, target: string, op: any) {
  return { source, target, kind: 'identity' as const, sign: (op === 'subtrahend' ? '-' : '+') as any, op, strength: 'strong' as const, confidence: 'high' as const, provenance: 'curated' as const }
}
function Inf(source: string, target: string, sign: any, mechanism: string, flip: string | undefined, strength: any, override?: any) {
  return { source, target, kind: 'influence' as const, sign: (override ?? sign), mechanism, flip, strength, confidence: 'medium' as const, provenance: 'curated' as const }
}
function As(source: string, target: string, mechanism: string) {
  return { source, target, kind: 'associative' as const, sign: 'n/a' as const, mechanism, strength: 'medium' as const, confidence: 'low' as const, provenance: 'curated' as const }
}
