// Окно «Доступно в полной версии»: что бы ни было под замком — плашка каталога,
// чип карты в справочнике, вкладка карточки — сначала объясняем, и только по кнопке
// уводим на лендинг. Прямой переход на лендинг не считывался: человек нажимал на карту
// и оказывался на продающей странице, не понимая почему (решение Марии 29.09.2026).
import { useEffect, useState } from 'react'
import { BASE } from '../atlas/atlas'
import { BUY_URL, goTop } from './nav'

const listeners = new Set<(v: boolean) => void>()

/** Показать окно. Зовётся откуда угодно: каталог, справочник, карточка метрики. */
export function openLockDialog() {
  listeners.forEach((fn) => fn(true))
}

function plural(n: number, one: string, few: string, many: string) {
  const form = n % 10 === 1 && n % 100 !== 11 ? one
    : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many
  return `${n} ${form}`
}

/** Ставится один раз в корне приложения. */
export function LockDialogHost() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    listeners.add(setOpen)
    return () => { listeners.delete(setOpen) }
  }, [])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])
  if (!open) return null

  // Число бесплатных карт — из данных; бесплатное дерево сейчас одно, разбор чистой прибыли.
  const free = new Set((BASE.meta as { freeSections?: string[] }).freeSections ?? [])
  const maps = BASE.sections.filter((s) => free.has(s.name)).length

  return (
    <div className="lockdlg" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}>
      <div className="lockdlg__box" role="dialog" aria-modal="true" aria-labelledby="lockdlg-h">
        <span className="lockdlg__ic" aria-hidden>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
            strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
        </span>
        <h3 id="lockdlg-h">Доступно в полной версии Атласа</h3>
        <p>Бесплатно открыты {plural(maps, 'карта', 'карты', 'карт')} и дерево чистой прибыли.</p>
        <div className="lockdlg__act">
          <button type="button" className="lockdlg__btn" onClick={() => setOpen(false)}>Понятно</button>
          <button type="button" className="lockdlg__btn lockdlg__btn--go" autoFocus
            onClick={() => { setOpen(false); goTop(BUY_URL) }}>Узнать о полной версии</button>
        </div>
      </div>
    </div>
  )
}
