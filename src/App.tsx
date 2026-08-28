import { useEffect, useRef, useState } from 'react'
import { Footer } from './site/Footer'
import { Catalog } from './site/Catalog'
import { MapView } from './map/MapView'
import { TreeView, treeExists } from './tree/TreeView'
import { BASE, isSectionUnlocked } from './atlas/atlas'
import { EMBED, CATALOG_PAGE, goTop, openTree } from './site/nav'

// Дерево открывается тем же приложением, что и карты: ?tree=<slug>.
//
// Девять деревьев — один разбор чистой прибыли, и подчинённое дерево читается только
// вместе с ней: слева приглушённый первый уровень, чипы «1 / 2 уровень», ключевая
// метрика наверху под переключателем моделей. Поэтому `?tree=<подчинённое>` открывает
// НЕ его корнем, а дерево-родителя с провалом внутрь. Так ведут себя разом все входы:
// кнопка «Дерево этой метрики», присланная ссылка, поиск в каталоге и ссылка на метрику
// соседнего дерева. Раньше правильный вид давал только чип «+N» внутри дерева.
function treeFromUrl(): { slug: string; drill: string | null } | null {
  const want = new URLSearchParams(window.location.search).get('tree')
  if (!want || !treeExists(want)) return null
  const t = (BASE.trees ?? []).find((x) => x.slug === want)
  // Родитель есть — открываем его, а имя подчинённого отдаём как начальный провал:
  // `drill` внутри дерева адресуется именем узла, и оно совпадает с именем дерева.
  return t?.parent ? { slug: t.parent, drill: t.name } : { slug: want, drill: null }
}

function sectionFromUrl(): string | null {
  const p = new URLSearchParams(window.location.search).get('map')
  if (!p) return null
  // Открываем только карты, данные которых загружены (без оплаты — только бесплатные).
  return BASE.sections.some((s) => s.name === p) && isSectionUnlocked(p) ? p : null
}

export default function App() {
  const [section, setSection] = useState<string | null>(() => sectionFromUrl())
  const target0 = treeFromUrl()
  const [tree, setTree] = useState<string | null>(() => target0?.slug ?? null)
  // Провал, заданный адресом: применяется один раз при открытии дерева.
  const [drillTo, setDrillTo] = useState<string | null>(() => target0?.drill ?? null)
  // В адресе держим ЗАПРОШЕННОЕ дерево, а не корень: иначе скопированная ссылка
  // теряет, во что провалились, и открывает разбор с верхнего уровня.
  const [urlTree, setUrlTree] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get('tree') ?? null)
  // Открыто ли приложение сразу на карте (её отдельная страница Тильды) — тогда «назад»
  // ведёт на страницу каталога, а не сворачивает SPA.
  const openedOnMap = useRef(sectionFromUrl() !== null)

  useEffect(() => {
    const url = new URL(window.location.href)
    if (tree) url.searchParams.set('tree', urlTree ?? tree)
    else { url.searchParams.delete('tree'); if (!section) url.searchParams.delete('node') }
    window.history.replaceState(null, '', url.toString())
  }, [tree, section, urlTree])

  useEffect(() => {
    const url = new URL(window.location.href)
    if (section) url.searchParams.set('map', section)
    // Вернулись в каталог — снимаем и метрику: иначе следующая открытая карта
    // подхватит ?node= от прошлой и раскроет чужую карточку.
    else { url.searchParams.delete('map'); url.searchParams.delete('node') }
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
        {tree ? (
          <TreeView slug={tree} onBack={() => setTree(null)} initialDrill={drillTo} />
        ) : section ? (
          <MapView
            section={section}
            onBack={() => {
              // Если карту открыли как отдельную страницу — «назад» ведёт на каталог Тильды.
              if (EMBED && openedOnMap.current) goTop(CATALOG_PAGE)
              else setSection(null)
            }}
          />
        ) : (
          <Catalog onOpenTree={(slug, nodeId) => {
            // В embed уводим ВЕРХНЕЕ окно на страницу дерева, а не подменяем вид
            // внутри рамки каталога. Иначе адрес страницы не меняется (ссылку не дать,
            // назад не вернуться), а высота остаётся каталожной: iframe там растёт под
            // контент, дерево просит 100vh, и получается круг — высота застревает
            // на случайном значении. На своей странице высоту задаёт хост.
            if (EMBED) { openTree(slug, nodeId); return }
            // адрес правим ДО монтирования: TreeView читает ?node= при первом рендере
            const url = new URL(window.location.href)
            if (nodeId) url.searchParams.set('node', nodeId)
            else url.searchParams.delete('node')
            window.history.replaceState(null, '', url.toString())
            setDrillTo(null)
            setUrlTree(slug)
            setTree(slug)
            window.scrollTo(0, 0)
          }} onOpen={(s, nodeId) => {
            // Метрика из поиска: адрес правим ДО монтирования карты — MapView
            // читает ?node= один раз, при первом рендере.
            const url = new URL(window.location.href)
            if (nodeId) url.searchParams.set('node', nodeId)
            else url.searchParams.delete('node')
            window.history.replaceState(null, '', url.toString())
            setSection(s)
          }} />
        )}
      </main>
      {!EMBED && !section && <Footer />}
    </div>
  )
}
