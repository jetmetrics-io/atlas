// Поиск по каталогу: одно поле, две группы в выдаче — карты и метрики.
//
// Зачем метрики отдельной группой: названия карт человек помнит редко, а метрику,
// которую ищет, называет точно («ARPU», «отток»). Найдя метрику, он хочет попасть
// не в карту вообще, а в саму метрику — поэтому клик открывает карту с уже
// раскрытой карточкой.
//
// Почему у каждой метрики подписана карта: 36 названий встречаются в нескольких
// картах, а «Выручка» — в шести. Без подписи выдача из шести одинаковых строк
// не даёт выбрать, куда идти.
import { useEffect, useMemo, useRef, useState } from 'react'
import { BASE, PAID, isSectionFree, isSectionUnlocked } from '../atlas/atlas'
import { metricContent } from '../atlas/content'

export type SearchHit =
  | { kind: 'map'; section: string; nodes: number; locked: boolean }
  | { kind: 'metric'; id: string; name: string; section: string; locked: boolean; why?: string }

// Регистр и «ё» не должны мешать: человек набирает «учет», а метрика — «Учёт».
const norm = (s: unknown) =>
  String(s ?? '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim()

const MAX_MAPS = 6
const MAX_METRICS = 20

/** Ранг совпадения: точное имя важнее начала, начало — важнее середины слова. */
function rank(hay: string, needle: string): number {
  const i = hay.indexOf(needle)
  if (i < 0) return -1
  if (hay === needle) return 0                           // ровно то, что набрали
  if (i === 0) return 1                                  // начинается с запроса
  if (/[\s(,/-]/.test(hay[i - 1] ?? '')) return 2        // начало слова внутри строки
  return 3                                               // где-то в середине слова
}

export function useSearch(query: string): { maps: SearchHit[]; metrics: SearchHit[]; total: number } {
  return useMemo(() => {
    const q = norm(query)
    if (q.length < 2) return { maps: [], metrics: [], total: 0 }

    const maps: (SearchHit & { r: number })[] = []
    for (const s of BASE.sections) {
      if (!s.name) continue
      const r = rank(norm(s.name), q)
      if (r >= 0) maps.push({ kind: 'map', section: s.name, nodes: s.nodes, locked: !isSectionUnlocked(s.name), r })
    }

    const metrics: (SearchHit & { r: number })[] = []
    for (const n of BASE.nodes) {
      const c = metricContent(n.id)
      // Ищем и по другим именам метрики: человек может помнить её как «ARPC»
      // или «Repeat Rate», а в карте она названа по-русски.
      const alt = `${c['Синонимы'] ?? ''} ${c['EN'] ?? ''}`
      let r = rank(norm(n.name), q)
      let why: string | undefined
      if (r < 0) {
        const ra = rank(norm(alt), q)
        if (ra >= 0) {
          r = ra + 4                                     // совпало по второму имени — ниже прямых
          // показываем, каким именно именем нашлось, иначе строка выглядит случайной
          why = [...String(c['Синонимы'] ?? '').split(';'), ...String(c['EN'] ?? '').split(';')]
            .map((x) => x.trim()).filter(Boolean)
            .find((x) => norm(x).includes(q))
        }
      }
      if (r >= 0) {
        metrics.push({ kind: 'metric', id: n.id, name: n.name, section: n.section,
          locked: !isSectionUnlocked(n.section), why, r })
      }
    }

    // Доступные — выше закрытых: клик по закрытой ведёт на покупку, а не к ответу.
    const by = (a: { r: number; locked: boolean }, b: { r: number; locked: boolean }) =>
      Number(a.locked) - Number(b.locked) || a.r - b.r
    maps.sort(by)
    metrics.sort(by)

    return {
      maps: maps.slice(0, MAX_MAPS),
      metrics: metrics.slice(0, MAX_METRICS),
      total: maps.length + metrics.length,
    }
  }, [query])
}

export function Search({ onOpenMap, onOpenMetric, onBuy }: {
  onOpenMap: (section: string) => void
  onOpenMetric: (section: string, id: string) => void
  onBuy: () => void
}) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(0)
  const box = useRef<HTMLDivElement>(null)
  const { maps, metrics, total } = useSearch(q)

  const flat: SearchHit[] = [...maps, ...metrics]
  useEffect(() => { setCursor(0) }, [q])

  // Клик мимо — закрыть выдачу.
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const go = (h: SearchHit) => {
    if (h.locked) { onBuy(); return }
    setOpen(false)
    if (h.kind === 'map') onOpenMap(h.section)
    else onOpenMetric(h.section, h.id)
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setOpen(false); return }
    if (!flat.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => (c + 1) % flat.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => (c - 1 + flat.length) % flat.length) }
    else if (e.key === 'Enter') { e.preventDefault(); go(flat[cursor]) }
  }

  // Подсветка совпавшего куска: глазу нужно увидеть, почему строка в выдаче.
  const mark = (text: string) => {
    const i = norm(text).indexOf(norm(q))
    if (i < 0) return text
    return (<>
      {text.slice(0, i)}<b>{text.slice(i, i + q.length)}</b>{text.slice(i + q.length)}
    </>)
  }

  const showing = open && q.trim().length >= 2

  return (
    <div className="asearch" ref={box}>
      <div className="asearch__field">
        <svg className="asearch__ic" viewBox="0 0 24 24" width="17" height="17" fill="none"
          stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" />
        </svg>
        <input
          className="asearch__input"
          value={q}
          placeholder="Поиск по картам и метрикам"
          onChange={(e) => { setQ(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          aria-label="Поиск по картам и метрикам"
        />
        {q && (
          <button className="asearch__clear" onClick={() => { setQ(''); setOpen(false) }} aria-label="Очистить">×</button>
        )}
      </div>

      {showing && (
        <div className="asearch__drop">
          {total === 0 && (
            <div className="asearch__empty">Ничего не нашлось. Попробуйте другое слово — например, «выручка» или «отток».</div>
          )}

          {maps.length > 0 && (
            <div className="asearch__group">
              <div className="asearch__ghead">Карты</div>
              {maps.map((h, i) => h.kind === 'map' && (
                <button key={h.section}
                  className={`asearch__row${cursor === i ? ' is-cur' : ''}${h.locked ? ' is-locked' : ''}`}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => go(h)}>
                  <span className="asearch__nm">{mark(h.section)}</span>
                  <span className="asearch__side">
                    {h.locked ? 'под замком' : `${h.nodes} метрик`}
                    {!PAID && !h.locked && isSectionFree(h.section) && <span className="asearch__free">бесплатно</span>}
                  </span>
                </button>
              ))}
            </div>
          )}

          {metrics.length > 0 && (
            <div className="asearch__group">
              <div className="asearch__ghead">Метрики</div>
              {metrics.map((h, i) => h.kind === 'metric' && (
                <button key={h.id}
                  className={`asearch__row${cursor === maps.length + i ? ' is-cur' : ''}${h.locked ? ' is-locked' : ''}`}
                  onMouseEnter={() => setCursor(maps.length + i)}
                  onClick={() => go(h)}>
                  <span className="asearch__nm">
                    {/* подсвечиваем там, где совпало: в самом названии либо во втором имени */}
                    {h.why ? h.name : mark(h.name)}
                    {/* второе имя — в скобках сразу за названием: отдельной строкой
                        оно читается как склейка двух разных метрик */}
                    {h.why && <span className="asearch__why"> ({mark(h.why)})</span>}
                  </span>
                  {/* карта метрики: 36 названий повторяются в разных картах */}
                  <span className="asearch__side">{h.section}{h.locked && ' · под замком'}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
