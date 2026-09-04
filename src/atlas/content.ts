// Контент карточек метрик: шесть полей, заполненных и вычитанных вручную
// (см. воркспейс Атласа, content/README.md — 745/745 метрик, 28 карт).
//
// Грузится ОТДЕЛЬНО от базы и не блокирует карту: с контентом внутри общего файла
// atlas_full.json вырос бы с 465 KB до ~2.5 MB, и карта появлялась бы заметно позже.
// Здесь файл запрашивается параллельно, а панель метрики показывает тексты, как
// только они пришли. Гейт тот же, что у узлов: content_free.json несёт только
// метрики бесплатных карт (режется в scripts/gen-data.mjs).

/** Разрез метрики: в каком виде её разбирают, когда цифра сдвинулась. */
export interface Dimension { name: string; note: string }

export interface MetricContent {
  'Описание'?: string
  'Формула'?: string
  'Нюансы расчёта'?: string
  'Пример расчёта'?: string
  'Важность'?: string
  'Когда не нужна'?: string
  'EN'?: string
  'Синонимы'?: string
  // Суть: тег направления и фраза, объясняющая, почему знак именно такой
  'Суть'?: string
  'Суть · пояснение'?: string
  'Разрезы'?: Dimension[]
}

type ContentMap = Record<string, MetricContent>

let CONTENT: ContentMap = {}
let loaded = false
const waiters = new Set<() => void>()

/** Контент метрики по её id. Пустой объект, пока файл не пришёл. */
export function metricContent(id: string): MetricContent {
  return CONTENT[id] ?? {}
}

/** Пришёл ли уже файл с контентом. */
export function contentReady(): boolean {
  return loaded
}

/** Подписка на загрузку: панель перерисуется, когда тексты приедут. */
export function onContentReady(fn: () => void): () => void {
  if (loaded) { fn(); return () => {} }
  waiters.add(fn)
  return () => waiters.delete(fn)
}

/**
 * Запустить загрузку. Зовётся из main.tsx сразу после того, как стало известно,
 * оплачен ли доступ. Промис не ждут: карта рисуется, тексты подъезжают следом.
 */
export function loadContent(paid: boolean, base = ''): Promise<void> {
  const file = paid ? 'content_full.json' : 'content_free.json'
  return fetch(`${base}data/${file}`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((json: ContentMap) => { CONTENT = json })
    .catch(() => { CONTENT = {} })   // без контента карточка показывает поля из базы
    .finally(() => {
      loaded = true
      waiters.forEach((fn) => fn())
      waiters.clear()
    })
}
