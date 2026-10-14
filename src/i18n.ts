// Язык интерфейса: одна кодовая база, две сборки. Русская — «Атлас метрик»
// для джетметрикс.рф, английская — «Map Library» для jetmetrics.io.
//
// Язык задаётся при сборке (`VITE_LANG=en`, см. npm run dev:en / build:en), а не
// в рантайме: переключателя нет, у каждой сборки свой сайт.
//
// Ключ словаря — сама русская строка. В русской сборке t() возвращает её как есть,
// поэтому русский интерфейс от обёртки не меняется ни на символ. Перевод лежит
// в src/i18n/en.ts. Данные (названия метрик, тексты карточек) сюда не относятся:
// английские данные собираются отдельно и грузятся так же, из ./data/.
import { createElement, Fragment, type ReactNode } from 'react'
import { EN } from './i18n/en'

export const LANG: 'ru' | 'en' = import.meta.env.VITE_LANG === 'en' ? 'en' : 'ru'

const DICT: Record<string, string> = LANG === 'en' ? EN : {}
const warned = new Set<string>()

function lookup(ru: string): string {
  if (LANG !== 'en') return ru
  const en = DICT[ru]
  if (en !== undefined) return en
  // Нет перевода — показываем русский и один раз говорим об этом в консоли разработки.
  if (import.meta.env.DEV && !warned.has(ru)) {
    warned.add(ru)
    console.warn('[i18n] нет перевода:', ru)
  }
  return ru
}

/** Строка интерфейса. Подстановки — `{name}`: t('Шаг {i} из {n}', { i: 1, n: 6 }). */
export function t(ru: string, vars?: Record<string, string | number>): string {
  const s = lookup(ru)
  if (!vars) return s
  return s.replace(/\{(\w+)\}/g, (all, k: string) => (k in vars ? String(vars[k]) : all))
}

/**
 * Строка с разметкой: `<b>…</b>` (и любой другой тег, например `<kbd>`) и подстановки
 * `{name}`, в том числе React-узлы. Тег можно отрисовать своей функцией:
 * rich('Справочник <ac>метрик</ac>', { ac: (s) => <span className="ac">{s}</span> }).
 */
export function rich(ru: string, parts: Record<string, ReactNode | ((inner: string) => ReactNode)> = {}): ReactNode {
  const s = lookup(ru)
  const out: ReactNode[] = []
  const re = /<(\w+)>(.*?)<\/\1>|\{(\w+)\}/gs
  let i = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(s))) {
    if (m.index > i) out.push(s.slice(i, m.index))
    if (m[1]) {
      const p = parts[m[1]]
      out.push(typeof p === 'function' ? p(m[2]) : createElement(m[1], null, m[2]))
    } else {
      const p = parts[m[3]]
      out.push(p === undefined || typeof p === 'function' ? m[0] : p)
    }
    i = m.index + m[0].length
  }
  if (i < s.length) out.push(s.slice(i))
  return createElement(Fragment, null, ...out)
}

/**
 * Форма слова при числе. Русских форм три (1 метрика, 2 метрики, 5 метрик),
 * английских две (1 metric, 2 metrics). Возвращает только слово, без числа.
 */
export function plural(n: number, ru: [string, string, string], en: [string, string]): string {
  if (LANG === 'en') return n === 1 ? en[0] : en[1]
  const t10 = n % 10, t100 = n % 100
  return t10 === 1 && t100 !== 11 ? ru[0]
    : t10 >= 2 && t10 <= 4 && (t100 < 10 || t100 >= 20) ? ru[1] : ru[2]
}

const MONTHS_RU = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

/** Дата из ISO (`2026-10-05`): «5 октября 2026» / «October 5, 2026». */
export function formatDate(iso?: string): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-').map(Number)
  return LANG === 'en' ? `${MONTHS_EN[m - 1]} ${d}, ${y}` : `${d} ${MONTHS_RU[m - 1]} ${y}`
}
