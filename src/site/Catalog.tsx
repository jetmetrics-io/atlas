import { FAMILIES, sectionsOfFamily, BASE, TIER, isSectionFree } from '../atlas/atlas'

// Куда ведёт клик по закрытой карте (лендинг с покупкой полного доступа).
const BUY_URL = 'https://джетметрикс.рф/atlas'

// Уводим ВЕРХНЕЕ окно (мы внутри iframe на Тильде) на страницу покупки.
function goBuy() {
  try {
    if (window.top && window.top !== window.self) { window.top.location.href = BUY_URL; return }
  } catch { /* cross-origin чтение запрещено, но навигация ниже сработает */ }
  window.location.href = BUY_URL
}

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

export function Catalog({ onOpen }: { onOpen: (section: string) => void }) {
  const meta = BASE.meta as { updated?: string }
  const families = FAMILIES.filter((f) => sectionsOfFamily(f).length > 0)
  const totalMaps = families.reduce((a, f) => a + sectionsOfFamily(f).length, 0)
  const totalMetrics = families.reduce(
    (a, f) => a + sectionsOfFamily(f).reduce((s, x) => s + x.nodes, 0), 0)

  const stats: [string, string][] = [
    [String(families.length), 'категорий'],
    [String(totalMaps), 'карт'],
    [String(totalMetrics), 'метрик'],
  ]

  return (
    <div className="catalog">
      <div className="container">
        <div className="catalog__top">
          <div className="catalog__hero">
            <span className="eyebrow"><span className="line" />АТЛАС МЕТРИК</span>
            <h1>Карты метрик <span className="ac">по направлениям</span></h1>
            <p>Выберите направление. Внутри карта показателей: что на что влияет, прямо или обратно,
              и на какие рычаги вы реально можете нажать.</p>
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

        {FAMILIES.map((fam) => {
          const secs = sectionsOfFamily(fam)
          if (!secs.length) return null
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
                {secs.map((s, i) => {
                  const free = isSectionFree(s.name)
                  // В full-сборке все карты обычные. В free — бесплатные с бейджем,
                  // закрытые с замком и переходом на покупку.
                  const locked = TIER === 'free' && !free
                  const cls = 'mcard' +
                    (TIER === 'free' && free ? ' mcard--free' : '') +
                    (locked ? ' mcard--locked' : '')
                  return (
                    <div key={s.slug} className={cls}
                      onClick={() => (locked ? goBuy() : onOpen(s.name))}>
                      {locked ? (
                        <span className="mcard__lock" aria-label="Закрытая карта">
                          <svg viewBox="0 0 24 24" width="16" height="16" fill="none"
                            stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="5" y="11" width="14" height="9" rx="2" />
                            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                          </svg>
                        </span>
                      ) : (
                        <span className="mcard__ix">{String(i + 1).padStart(2, '0')}</span>
                      )}
                      {TIER === 'free' && free && <span className="mcard__badge">Бесплатно</span>}
                      <div className="mcard__nm">{s.name}</div>
                      <div className="mcard__meta">{s.nodes} метрик</div>
                      {locked && <span className="mcard__cta">Открыть все карты →</span>}
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
