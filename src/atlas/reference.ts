// Справочник метрик: строка на метрику и все её места (data/reference.json).
//
// Файл один на всех, в отличие от atlas_* и content_*: в справочнике неоплативший
// видит ВСЕ метрики — название, единицу, суть, определение и формулу (решение Марии
// 29.09.2026). Нюансы, пример, важность и разрезы остаются в content_* под гейтом.
//
// Грузится параллельно с контентом и не держит каталог: пока файла нет, справочник
// показывает «Загружаем…», карточка на карте — без блока «Где стоит».

export interface RefPlace {
  node: string                      // node_id места: по нему открывается карта с раскрытой метрикой
  a: string                         // имя артефакта
  type: 'map' | 'tree'
  access: 'free' | 'paid' | null
  /** Роль в этом месте: на карте — роль карты, в дереве — ярус (свод C-28, C-29). */
  role: string
  fam?: string                      // ключ семьи каталога — для фильтра «Направление»
}

export interface RefMetric {
  mid: number
  name: string
  unit?: string
  ess?: string
  desc?: string
  formula?: string
  syn?: string
  en?: string
  places: RefPlace[]
  /** Адрес метрики без места — `spravochnik/<slug>`: по нему открывается её карточка
   *  и ведут ссылки из текстов. У метрики с местами поля нет (Мария 30.09.2026). */
  node?: string
}

/** Начало адреса метрики, у которой нет места ни на карте, ни в дереве. */
export const REF_ONLY = 'spravochnik/'
export const isRefOnly = (id: string): boolean => id.startsWith(REF_ONLY)

let REF: RefMetric[] = []
let BY_MID = new Map<number, RefMetric>()
let MID_OF_NODE = new Map<string, number>()
let loaded = false
const waiters = new Set<() => void>()

export const refMetrics = (): RefMetric[] => REF
export const refByMid = (mid?: number | null): RefMetric | undefined => (mid == null ? undefined : BY_MID.get(mid))
export const midOfNode = (node: string): number | undefined => MID_OF_NODE.get(node)
export const refReady = (): boolean => loaded

export function onRefReady(fn: () => void): () => void {
  if (loaded) { fn(); return () => {} }
  waiters.add(fn)
  return () => waiters.delete(fn)
}

export function loadReference(base = ''): Promise<void> {
  const fresh = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
  return fetch(`${base}data/reference.json`, fresh ? { cache: 'no-store' } : undefined)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((json: { metrics: RefMetric[] }) => {
      REF = json.metrics ?? []
      BY_MID = new Map(REF.map((m) => [m.mid, m]))
      MID_OF_NODE = new Map(REF.flatMap((m) => [
        ...m.places.map((p) => [p.node, m.mid] as [string, number]),
        ...(m.node ? [[m.node, m.mid] as [string, number]] : []),
      ]))
    })
    .catch(() => { REF = [] })
    .finally(() => {
      loaded = true
      waiters.forEach((fn) => fn())
      waiters.clear()
    })
}
