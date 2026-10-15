// Окно «Доступно в полной версии»: что бы ни было под замком — плашка каталога,
// чип карты в справочнике, вкладка карточки — сначала объясняем, и только по кнопке
// уводим на лендинг. Прямой переход на лендинг не считывался: человек нажимал на карту
// и оказывался на продающей странице, не понимая почему (решение Марии 29.09.2026).
import { useEffect, useState } from 'react'
import { BASE } from '../atlas/atlas'
import { BUY_URL, goTop } from './nav'
import { t, plural } from '../i18n'
import { useHostView } from './hostView'

const listeners = new Set<(v: boolean) => void>()

/** Показать окно. Зовётся откуда угодно: каталог, справочник, карточка метрики. */
export function openLockDialog() {
  listeners.forEach((fn) => fn(true))
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
  // Map Library inside Workspace (English build): the iframe is as tall as the whole catalog or dictionary,
  // and the middle of it can be thousands of pixels below the screen. The window stands in the middle of
  // the visible part instead (hostView.ts); the Russian build gets null and keeps the plain centring.
  const vis = useHostView(open)
  if (!open) return null

  // Число бесплатных карт — из данных; бесплатное дерево сейчас одно, разбор чистой прибыли.
  const free = new Set((BASE.meta as { freeSections?: string[] }).freeSections ?? [])
  const maps = BASE.sections.filter((s) => free.has(s.name)).length

  return (
    <div className={vis ? 'lockdlg lockdlg--at' : 'lockdlg'} role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}>
      <div className="lockdlg__box" role="dialog" aria-modal="true" aria-labelledby="lockdlg-h"
        style={vis ? { top: (vis.y0 + vis.y1) / 2 } : undefined}>
        <span className="lockdlg__ic" aria-hidden>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
            strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
        </span>
        <h3 id="lockdlg-h">{t('Доступно в полной версии Атласа')}</h3>
        <p>{t('Бесплатно открыты {maps} и дерево чистой прибыли.',
          { maps: `${maps} ${plural(maps, ['карта', 'карты', 'карт'], ['map', 'maps'])}` })}</p>
        <div className="lockdlg__act">
          <button type="button" className="lockdlg__btn" onClick={() => setOpen(false)}>{t('Понятно')}</button>
          <button type="button" className="lockdlg__btn lockdlg__btn--go" autoFocus
            onClick={() => { setOpen(false); goTop(BUY_URL) }}>{t('Узнать о полной версии')}</button>
        </div>
      </div>
    </div>
  )
}
