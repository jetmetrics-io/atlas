import React from 'react'
import ReactDOM from 'react-dom/client'
import '@xyflow/react/dist/style.css'
import './index.css'
import App from './App'
import { initAtlas } from './atlas/atlas'
import { resolveEmail, isPaid } from './site/access'
import type { AtlasBase } from './atlas/types'

const root = ReactDOM.createRoot(document.getElementById('root')!)

// Пока решаем доступ и грузим данные — лёгкий лоадер (React заменит его на App).
root.render(<div className="boot" aria-busy="true"><span className="boot__dot" /></div>)

const loadData = (name: string): Promise<AtlasBase> =>
  // Относительный путь: приложение живёт в /atlas/index.html → /atlas/data/...
  fetch(`./data/${name}.json`, { cache: 'no-store' }).then((r) => {
    if (!r.ok) throw new Error(`data ${name}: ${r.status}`)
    return r.json() as Promise<AtlasBase>
  })

async function boot() {
  // 1. Кто залогинен → 2. оплатил ли. Одна сборка, гейт — по факту оплаты.
  const email = await resolveEmail()
  const paid = await isPaid(email)
  // 3. Данные: полная база только оплатившим; остальным — три бесплатные карты.
  //    full-данные грузим лишь при оплате — бесплатнику закрытые карты физически не приходят.
  const base = await loadData(paid ? 'atlas_full' : 'atlas_free')
  initAtlas(base, paid)
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
      Не удалось загрузить Атлас. Обновите страницу.
    </div>,
  )
})
