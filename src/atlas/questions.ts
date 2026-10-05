// Вопросы к метрикам: группы с подсказками, базовые (одни на все метрики) и свои
// вопросы каждой метрики. Показываются во вкладке «Анализ» под разрезами.
//
// Лежат отдельно от карточек и по id метрики: 8 114 вопросов — около 2 МБ, внутри
// content_*.json они удвоили бы файл, который грузится на старте. Поэтому файл
// запрашивается только тогда, когда впервые открыли «Анализ». Гейт тот же, что
// у карточек: questions_free.json несёт вопросы метрик бесплатных карт
// (собирает scripts/build_app.py, проверяет scripts/check_dump.py).

export interface QuestionGroup { id: string; name: string; hint: string }

interface QuestionsFile {
  groups: QuestionGroup[]
  base: string[]
  metrics: Record<string, [string, string][]>
}

/** Группа вопросов метрики в порядке показа: базовые, исследовательские, управленческие, данные. */
export interface MetricQuestions { group: QuestionGroup; items: string[] }

let DATA: QuestionsFile | null = null
let status: 'idle' | 'loading' | 'done' = 'idle'
let file = 'questions_free.json'
let root = ''
const waiters = new Set<() => void>()

/** Зовётся из main.tsx рядом с loadContent: какой файл брать, решает оплата. */
export function initQuestions(paid: boolean, base = ''): void {
  file = paid ? 'questions_full.json' : 'questions_free.json'
  root = base
}

/** Загрузить файл, если ещё не грузили. Повторные вызовы ничего не делают. */
export function loadQuestions(): void {
  if (status !== 'idle') return
  status = 'loading'
  // Как у контента: на dev-сервере без кэша, иначе после пересборки видны старые вопросы.
  const fresh = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
  fetch(`${root}data/${file}`, fresh ? { cache: 'no-store' } : undefined)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((json: QuestionsFile) => { DATA = json })
    .catch(() => { DATA = null })   // без файла «Анализ» показывает только разрезы
    .finally(() => {
      status = 'done'
      waiters.forEach((fn) => fn())
      waiters.clear()
    })
}

/** Пришёл ли файл (или окончательно не пришёл). */
export function questionsReady(): boolean {
  return status === 'done'
}

export function onQuestionsReady(fn: () => void): () => void {
  if (status === 'done') { fn(); return () => {} }
  waiters.add(fn)
  return () => waiters.delete(fn)
}

/**
 * Вопросы метрики по группам. Базовые показываются только вместе со своими:
 * у метрики, чьих вопросов в файле нет (платная карта у неоплатившего), пусто.
 */
export function metricQuestions(mid?: number | null): MetricQuestions[] {
  if (!DATA || mid == null) return []
  const own = DATA.metrics[String(mid)]
  if (!own?.length) return []
  const data = DATA
  return data.groups
    .map((group) => ({
      group,
      items: group.id === 'base' ? data.base : own.filter(([g]) => g === group.id).map(([, t]) => t),
    }))
    .filter((x) => x.items.length > 0)
}
