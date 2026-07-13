import { useEffect, useState } from 'react'
import { Header } from './site/Header'
import { Footer } from './site/Footer'
import { Catalog } from './site/Catalog'
import { MapView } from './map/MapView'
import { BASE } from './atlas/atlas'

function sectionFromUrl(): string | null {
  const p = new URLSearchParams(window.location.search).get('map')
  if (!p) return null
  return BASE.sections.some((s) => s.name === p) ? p : null
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
  useEffect(() => {
    if (!EMBED) return
    let raf = 0
    const send = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const h = Math.ceil(document.documentElement.scrollHeight)
        window.parent.postMessage({ type: 'jm-atlas-height', height: h }, '*')
      })
    }
    send()
    const ro = new ResizeObserver(send)
    ro.observe(document.body)
    window.addEventListener('resize', send)
    return () => { cancelAnimationFrame(raf); ro.disconnect(); window.removeEventListener('resize', send) }
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
