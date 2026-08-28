import { useState } from 'react'
import { families as allFamilies, sectionsOfFamily, treesOfFamily, BASE, PAID, isSectionFree } from '../atlas/atlas'
import { EMBED, BUY_URL, goTop, mapPageUrl } from './nav'
import { Search } from './Search'

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
function fmtDate(iso?: string): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} ${MONTHS[m - 1]} ${y}`
}

// Штриховые монохромные иконки категорий. Цвет НЕ различает категории —
// он зарезервирован за типами метрик внутри карт. Категория = иконка + название.
const ICONS: Record<string, JSX.Element> = {
  finance: (
    <><rect x="3" y="6" width="18" height="13" rx="2.5" /><path d="M3 10.5h18" /><circle cx="16.5" cy="14" r="1.3" /></>
  ),
  marketing: (
    <><path d="M4 10v4a1 1 0 0 0 1 1h2l7 4V5L7 9H5a1 1 0 0 0-1 1Z" /><path d="M17 9.2a4 4 0 0 1 0 5.6" /></>
  ),
  sales: (
    <><path d="M3.5 5h17l-6.3 7.3V19l-4.4 2v-8.7L3.5 5Z" /></>
  ),
  product: (
    <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 9h18M6.2 7.1h.01M8.8 7.1h.01" /></>
  ),
  customers: (
    <><circle cx="9" cy="8" r="3.2" /><path d="M3.6 19c0-3.2 2.5-5.2 5.4-5.2s5.4 2 5.4 5.2" /><path d="M16 8.4a3 3 0 0 1 0 5M17.6 19c0-2.1-.8-3.8-2-4.8" /></>
  ),
  ops: (
    <><path d="M12 3 4 7v10l8 4 8-4V7l-8-4Z" /><path d="M4 7l8 4 8-4M12 11v10" /></>
  ),
  people: (
    <><circle cx="12" cy="8" r="3.4" /><path d="M5.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" /></>
  ),
  ecom: (
    <><path d="M6 8h12l-1 11.5H7L6 8Z" /><path d="M9 8.5V6a3 3 0 0 1 6 0v2.5" /></>
  ),
}

type Sec = { name: string; slug: string; nodes: number; total?: number }

// Счёт витрины бесплатного: «3 карты + 1 дерево».
function plural(n: number, one: string, few: string, many: string) {
  const form = n % 10 === 1 && n % 100 !== 11 ? one
    : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many
  return `${n} ${form}`
}

// Тип подписан на плашке: карта и дерево читаются по-разному, и по одному имени
// («Финансы» и «Чистая прибыль») их не различить.

export function Catalog({ onOpen, onOpenTree }: {
  onOpen: (section: string, nodeId?: string) => void
  onOpenTree: (slug: string, nodeId?: string) => void
}) {
  const meta = BASE.meta as { updated?: string; metrics?: number }
  const families = allFamilies().filter((f) => sectionsOfFamily(f).length > 0)
  const totalMaps = families.reduce((a, f) => a + sectionsOfFamily(f).length, 0)
  const trees = families.flatMap((f) => treesOfFamily(f))
  // Метрики считаем сквозные: метрика, стоящая и на карте, и в дереве, — одна метрика
  // Атласа. Число приходит из Базы (meta.metrics); складывать метрики артефактов нельзя,
  // так получаются места, и общие записи считаются дважды.
  const totalMetrics = meta.metrics ?? 0

  // Фильтр каталога: карты и деревья читаются по-разному, и человек обычно приходит
  // за чем-то одним. Витрину бесплатного фильтр разбирает вместе с группами.
  const [kindFilter, setKindFilter] = useState<'all' | 'map' | 'tree'>('all')
  const showMaps = kindFilter !== 'tree'
  const showTrees = kindFilter !== 'map'

  const stats: [string, string][] = [
    [String(families.length), 'категорий'],
    [String(totalMaps), 'карт'],
    [String(trees.length), trees.length === 1 ? 'дерево' : 'деревьев'],
    [String(totalMetrics), 'метрик'],
  ]

  // Бесплатные карты (когда пользователь без оплаты) — для витрины сверху, чтобы первый
  // экран не был сплошь «под замком».
  const freeMaps: Sec[] = !PAID && showMaps
    ? BASE.sections.filter((s) => s.name && isSectionFree(s.name))
    : []
  // Деревья открыты всем, поэтому стоят в той же витрине, что и бесплатные карты.
  const freeTrees = !PAID && showTrees ? allFamilies().flatMap((f) => treesOfFamily(f)) : []
  const freeTitle = [
    freeMaps.length ? `${plural(freeMaps.length, 'карта', 'карты', 'карт')}` : '',
    freeTrees.length ? `${plural(freeTrees.length, 'дерево', 'дерева', 'деревьев')}` : '',
  ].filter(Boolean).join(' + ')
  // Согласование под фильтр: одна плашка — «доступна»/«доступно», несколько — «доступны»
  const freeVerb = freeMaps.length + freeTrees.length > 1 ? 'доступны'
    : freeTrees.length ? 'доступно' : 'доступна'

  // Клик по карте: закрытая → покупка; в embed открытая ведёт на СВОЮ страницу Тильды
  // (если она заведена), иначе — открываем карту внутри приложения.
  const openCard = (name: string, nodeId?: string) => {
    // Поиск отдаёт метрики и карт, и деревьев: у дерева свой вид, не карта.
    const t = (BASE.trees ?? []).find((x) => x.name === name)
    if (t) { onOpenTree(t.slug, nodeId); return }
    if (EMBED) {
      const page = mapPageUrl(name)
      // из поиска метрика открывается сразу раскрытой: страница карты + ?node=
      if (page) { goTop(nodeId ? `${page}?node=${nodeId}` : page); return }
    }
    onOpen(name, nodeId)
  }

  // Одна карточка каталога. showIndex — моно-индекс в углу (только оплатившим).
  const card = (s: Sec, kind: 'map' | 'tree' = 'map') => {
    const tree = kind === 'tree'
    const free = tree || isSectionFree(s.name)
    const locked = !PAID && !free
    const cls = 'mcard' +
      (!PAID && free ? ' mcard--free' : '') +
      (locked ? ' mcard--locked' : '')
    return (
      <div key={s.slug} className={cls}
        onClick={() => (locked ? goTop(BUY_URL) : tree ? onOpenTree(s.slug) : openCard(s.name))}>
        {locked ? (
          // Замок-чип: в покое — только иконка; на ховере раскрывается в «Открыть все карты».
          // Абсолютное позиционирование → раскрытие НЕ меняет высоту карточки.
          <span className="mcard__lock" aria-label="Открыть все карты">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none"
              stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="11" width="14" height="9" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
            <span className="mcard__lock-txt">Открыть все карты</span>
          </span>
        ) : null}
        <span className="mcard__kind">{tree ? 'Дерево' : 'Карта'}</span>
        {!PAID && free && <span className="mcard__badge">Бесплатно</span>}
        <div className="mcard__nm">{s.name}</div>
        {/* У дерева на плашке весь разбор: чистая прибыль сама по себе — 12 метрик,
            а за ней стоят девять деревьев, куда читатель проваливается. */}
        <div className="mcard__meta">{(tree && s.total) || s.nodes} метрик</div>
      </div>
    )
  }

  return (
    <div className="catalog">
      <div className="container">
        <div className="catalog__top">
          <div className="catalog__hero">
            <span className="eyebrow"><span className="line" />АТЛАС МЕТРИК</span>
            <h1>Карты метрик <span className="ac">по направлениям</span></h1>
            <p>Выберите направление. Внутри карта показателей: что на что влияет, прямо или обратно,
              и на какие рычаги вы реально можете нажать.</p>
            <Search
              onOpenMap={(s) => openCard(s)}
              onOpenMetric={(s, id) => openCard(s, id)}
              onBuy={() => goTop(BUY_URL)}
            />

            <div className="kindbar" role="group" aria-label="Что показывать">
              {([['all', 'Всё', totalMaps + trees.length],
                 ['map', 'Карты', totalMaps],
                 ['tree', 'Деревья', trees.length]] as const).map(([k, label, n]) => (
                <button key={k} type="button"
                  className={'kindbar__b' + (kindFilter === k ? ' is-on' : '')}
                  aria-pressed={kindFilter === k}
                  onClick={() => setKindFilter(k)}>
                  {label}<span className="kindbar__n">{n}</span>
                </button>
              ))}
            </div>
          </div>

          <aside className="statspanel">
            <div className="statspanel__h">В атласе</div>
            {stats.map(([v, l]) => (
              <div className="statspanel__row" key={l}>
                <span className="sp__l">{l[0].toUpperCase() + l.slice(1)}</span>
                <span className="sp__v">{v}</span>
              </div>
            ))}
            <div className="statspanel__upd">
              <span className="updbadge__dot" />
              Обновлено {fmtDate(meta.updated)}
            </div>
          </aside>
        </div>

        {(freeMaps.length > 0 || freeTrees.length > 0) && (
          <section className="freebar">
            <div className="freebar__head">
              <span className="freebar__badge">Открыто бесплатно</span>
              <span className="freebar__title">
                {freeTitle} {freeVerb} целиком — откройте и посмотрите, как это работает
              </span>
            </div>
            <div className="mapgrid">
              {freeTrees.map((t) => card(t, 'tree'))}
              {freeMaps.map((s) => card(s))}
            </div>
          </section>
        )}

        {families.map((fam) => {
          const secs = showMaps ? sectionsOfFamily(fam) : []
          const fTrees = showTrees ? treesOfFamily(fam) : []
          if (!secs.length && !fTrees.length) return null
          return (
            <section className="family" key={fam.key}>
              <div className="family__head">
                <span className="family__ic" aria-hidden>
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none"
                    stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    {ICONS[fam.key]}
                  </svg>
                </span>
                <span className="family__title">{fam.title}</span>
                <span className="family__blurb">{fam.blurb}</span>
              </div>
              <div className="mapgrid">
                {fTrees.map((t) => card(t, 'tree'))}
                {secs.map((s) => card(s))}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
