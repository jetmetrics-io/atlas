import { useEffect, useRef, useState } from 'react'
import { Footer } from './site/Footer'
import { Catalog } from './site/Catalog'
import { MapView } from './map/MapView'
import { BASE, isSectionUnlocked } from './atlas/atlas'
import { EMBED, CATALOG_PAGE, goTop } from './site/nav'

function sectionFromUrl(): string | null {
  const p = new URLSearchParams(window.location.search).get('map')
  if (!p) return null
  // Открываем только карты, данные которых загружены (без оплаты — только бесплатные).
  return BASE.sections.some((s) => s.name === p) && isSectionUnlocked(p) ? p : null
}

export default function App() {
  const [section, setSection] = useState<string | null>(() => sectionFromUrl())
  // Открыто ли приложение сразу на карте (её отдельная страница Тильды) — тогда «назад»
  // ведёт на страницу каталога, а не сворачивает SPA.
  const openedOnMap = useRef(sectionFromUrl() !== null)

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
      <main className="site__main">
        {section ? (
          <MapView
            section={section}
            onBack={() => {
              // Если карту открыли как отдельную страницу — «назад» ведёт на каталог Тильды.
              if (EMBED && openedOnMap.current) goTop(CATALOG_PAGE)
              else setSection(null)
            }}
          />
        ) : (
          <Catalog onOpen={(s) => setSection(s)} />
        )}
      </main>
      {!EMBED && !section && <Footer />}
    </div>
  )
}
