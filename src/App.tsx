import { useEffect, useState } from 'react'
import { Header } from './site/Header'
import { Footer } from './site/Footer'
import { Catalog } from './site/Catalog'
import { MapView } from './map/MapView'
import { BASE, isSectionFree } from './atlas/atlas'

function sectionFromUrl(): string | null {
  const p = new URLSearchParams(window.location.search).get('map')
  if (!p) return null
  // Открываем только карты, данные которых есть в этой сборке (в free — только бесплатные).
  return BASE.sections.some((s) => s.name === p) && isSectionFree(p) ? p : null
}

// Встраиваемый режим (?embed=1): без своей шапки/футера — их даёт хост-страница
// (нативный блок Тильды). Приложение занимает весь контейнер.
const EMBED =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('embed') === '1'

export default function App() {
  const [section, setSection] = useState<string | null>(() => sectionFromUrl())

  useEffect(() => {
    const url = new URL(window.location.href)
    if (section) url.searchParams.set('map', section)
    else url.searchParams.delete('map')
    window.history.replaceState(null, '', url.toString())
  }, [section])

  // В embed сообщаем родителю (странице Тильды) высоту контента, чтобы iframe рос
  // под неё — тогда внутренней полосы прокрутки нет, остаётся одна страничная.
  // Простой опрос: шлём высоту только когда она изменилась. Надёжнее, чем
  // ResizeObserver/rAF (их тайминг зависит от движка и подгрузки шрифтов).
  useEffect(() => {
    if (!EMBED) return
    document.documentElement.classList.add('jm-embed')
    let last = 0
    const tick = () => {
      // body.scrollHeight, а НЕ documentElement — последний раздувается высотой
      // самого iframe и не даёт высоте уменьшиться (каталог→карта осталась бы длинной).
      const h = Math.ceil(document.body.scrollHeight)
      if (h && h !== last) {
        last = h
        window.parent.postMessage({ type: 'jm-atlas-height', height: h }, '*')
      }
    }
    tick()
    const id = window.setInterval(tick, 350)
    window.addEventListener('resize', tick)
    return () => { window.clearInterval(id); window.removeEventListener('resize', tick) }
  }, [])

  return (
    <div className={`site${EMBED ? ' site--embed' : ''}`}>
      {!EMBED && <Header onHome={() => setSection(null)} />}
      <main className="site__main">
        {section ? (
          <MapView section={section} onBack={() => setSection(null)} />
        ) : (
          <Catalog onOpen={(s) => setSection(s)} />
        )}
      </main>
      {!EMBED && !section && <Footer />}
    </div>
  )
}
