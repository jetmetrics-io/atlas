import React from 'react'
import ReactDOM from 'react-dom/client'
import '@xyflow/react/dist/style.css'
import './index.css'
import App from './App'
import { initAtlas } from './atlas/atlas'
import { loadContent } from './atlas/content'
import { initQuestions } from './atlas/questions'
import { loadReference } from './atlas/reference'
import { resolveEmail, isPaid } from './site/access'
import { workspacePaid, paidRoot, paidInit } from './site/paidData'
import type { AtlasBase } from './atlas/types'
import { t, LANG } from './i18n'

const root = ReactDOM.createRoot(document.getElementById('root')!)

// Пока решаем доступ и грузим данные — лёгкий лоадер (React заменит его на App).
root.render(<div className="boot" aria-busy="true"><span className="boot__dot" /></div>)

const loadData = (name: string, root = './', init?: RequestInit): Promise<AtlasBase> =>
  // Относительный путь: приложение живёт в /atlas/index.html → /atlas/data/...
  // (английская Map Library: платные данные — с сервера сайта, root и init из site/paidData.ts)
  fetch(`${root}data/${name}.json`, { cache: 'no-store', ...init }).then((r) => {
    if (!r.ok) throw new Error(`data ${name}: ${r.status}`)
    return r.json() as Promise<AtlasBase>
  })

async function boot() {
  // 1. Кто залогинен → 2. оплатил ли. Одна сборка, гейт — по факту оплаты.
  //    Английская Map Library (jetmetrics.io) почту не спрашивает: покупку проверяет сервер сайта по пропуску
  //    (site/paidData.ts), русский список покупателей к ней отношения не имеет.
  const email = LANG === 'en' ? '' : await resolveEmail()
  // ?paid=1 — отмычка для разработки: позволяет открыть платные карты
  // на dev-сервере, не заводя email в paid.json. Работает только на localhost.
  const devPaid = location.hostname === 'localhost' && new URLSearchParams(location.search).get('paid') === '1'
  const enPaid = !devPaid && LANG === 'en' && (await workspacePaid())
  const paid = devPaid || enPaid || (LANG !== 'en' && (await isPaid(email)))
  // 3. Данные: полная база только оплатившим; остальным — три бесплатные карты.
  //    full-данные грузим лишь при оплате — бесплатнику закрытые карты физически не приходят.
  //    Английской Map Library их отдаёт только сервер сайта (root и init — его адрес и пропуск).
  const dataRoot = enPaid ? paidRoot : './'
  const init = enPaid ? paidInit : undefined
  const base = await loadData(paid ? 'atlas_full' : 'atlas_free', dataRoot, init)
  initAtlas(base, paid)
  // 4. Контент карточек — параллельно, без await: карта рисуется сразу, тексты
  //    подъезжают следом и панель перерисовывается сама (см. atlas/content.ts).
  loadContent(paid, dataRoot, init)
  // Вопросы к метрикам — только запоминаем, какой файл брать: грузятся при первом
  //    открытии вкладки «Анализ» (см. atlas/questions.ts).
  initQuestions(paid, dataRoot, init)
  // Справочник метрик — тоже параллельно: один файл на всех, каталог его не ждёт.
  loadReference('./')
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
}

boot().catch((err) => {
  console.error('[atlas] boot failed', err)
  root.render(
    <div className="boot boot--err">
      {t('Не удалось загрузить Атлас. Обновите страницу.')}
    </div>,
  )
})
