// Дашборд, собранный из карты метрик. Десять блоков, три формы: число с графиком,
// таблица, столбики. Порядок блоков повторяет путь разбора — от «есть ли проблема»
// до «над чем работать в первую очередь», — но подписей-шагов на экране нет:
// экран читается сверху вниз сам.
//
// Цвет кодирует состояние метрики, а не её важность. Ни служебных комментариев,
// ни коридора нормы, ни второй оси Y. Подсказки «почему так» сняты до пересборки:
// тексты остались в blueprints.ts (поле tip), на экран они пока не выводятся.
import { useEffect, useRef, useState } from 'react'
import type { Blueprint, CutBlock, Metric, Tone } from './blueprints'
import { TYPES, pct, toneOf, alarmId } from './blueprints'
import { TypeIcon } from './icons'

// Линии и точки — не текст: для них порог AA 3:1, фирменные цвета проходят.
// Текстовые подписи графика живут в HTML и красятся из --d-faint (см. dash.css).
// Цвета графиков — из базовой темы Power BI (документация Microsoft по темам отчётов).
// grid = thirdLevelElements (цвет линий сетки осей), faint/muted = secondLevelElements,
// line = fourthLevelElements, data = первый цвет палитры данных.
const C = { data: '#118DFF', bad: '#D64554', good: '#1AAB40', flat: '#B3B0AD',
  grid: '#F3F2F1', line: '#B3B0AD', faint: '#605E5C', muted: '#605E5C' }

// Линия красится ПЕРВЫМ ЦВЕТОМ ПАЛИТРЫ, а не по состоянию метрики. Так делает Power BI:
// линейная диаграмма с одной мерой берёт dataColors[0], а покрасить линию целиком
// по знаку изменения там нечем — условное форматирование на линию не распространяется.
// Знак при этом не теряется: его несёт дельта рядом с числом, и вот она в Power BI
// красится условным форматированием по именам темы good и bad, то есть воспроизводится.
const col = (_t: Tone) => C.data
const fmt = (x: number, mx: number) =>
  mx < 10 ? x.toFixed(1).replace('.', ',') : mx > 1000 ? (Math.round(x / 100) * 100).toLocaleString('ru-RU') : String(Math.round(x))

// ── Линия. Ось Y подписана крайними значениями, ось X — единицей времени, а не н1…н8.
// ghost — вторая, служебная линия пунктиром: прогноз на графике факта. Отдельным блоком
// прогнозный узел не ставится (прогноз не вызывает факт), а расстояние между линиями —
// это ровно то, что мерит отдельная метрика карты.
// xlab — подпись оси X (Д5.6). Шаг ряда задаёт лист, а не компонент: у поддержки это недели,
// у финансов месяцы. Слово «недели» на месячном листе — не мелочь оформления: читатель
// пересчитывает по нему темп и получает вчетверо неверный ответ.
function Line({ series, tone, dom, thr, thrLabel, ghost, ghostLabel, h = 74, w = 300, xlab = 'недели' }: {
  series: number[]; tone: Tone; dom?: [number, number]; thr?: number; thrLabel?: string
  ghost?: number[]; ghostLabel?: string
  h?: number; w?: number; xlab?: string
}) {
  // Поле под подписи оси задаёт css в пикселях, а не viewBox в процентах: в узкой плитке
  // 12% ширины — это 23px, и «6 300» кеглем 10 туда не влезает, вылезая за край карточки.
  // Поэтому svg занимает только область графика, а подписи висят в css-полях вокруг него.
  const R = 6, T = 6, B = 6
  const all = ghost ? [...series, ...ghost] : series
  const mn0 = Math.min(...all), mx0 = Math.max(...all), rg0 = (mx0 - mn0) || 1
  const min = dom ? dom[0] : mn0 - rg0 * 0.08
  const max = dom ? dom[1] : mx0 + rg0 * 0.08
  const X = (i: number) => (i / (series.length - 1)) * (w - R)
  const Y = (v: number) => T + (1 - (v - min) / ((max - min) || 1)) * (h - T - B)
  const d = series.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1)).join(' ')
  const c = col(tone)
  const pc = (v: number, t: number) => `${(v / t) * 100}%`
  // Поле под подписи оси Y считается по самой длинной подписи, а не берётся константой.
  // Константа в 34px держала «14», но «131 100» вылезало из контейнера влево. Power BI
  // и DataLens в этом месте ведут себя так же: область построения ужимается под ось.
  // Ширина в пикселях, потому что кегль подписи фиксирован (12px, small light label).
  const yTop = fmt(max, max), yBot = fmt(min, max)
  const wOf = (s: string) => [...s].reduce((a, ch) => a + (/\d/.test(ch) ? 6.8 : /[.,]/.test(ch) ? 3.6 : 3.4), 0)
  const padL = Math.round(Math.max(wOf(yTop), wOf(yBot)) + 7)
  return (
    <div className="dchart" style={{ ['--dchart-pad' as string]: `${padL}px` }}>
      <div className="dchart__box" style={{ aspectRatio: `${w} / ${h}` }}>
        <svg className="dsvg" viewBox={`0 0 ${w} ${h}`} role="img" preserveAspectRatio="none">
          {[0, 1, 2].map((k) => {
            const y = T + (k / 2) * (h - T - B)
            return <line key={k} x1={0} y1={y} x2={w - R} y2={y} stroke={C.grid} strokeWidth={1}
              vectorEffect="non-scaling-stroke" />
          })}
          {thr != null && (
            <line x1={0} y1={Y(thr)} x2={w - R} y2={Y(thr)} stroke={C.faint} strokeWidth={1}
              strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
          )}
          {ghost && (
            <path d={ghost.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1)).join(' ')}
              fill="none" stroke={C.line} strokeWidth={1.6} strokeDasharray="4 3"
              strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          )}
          <path d={d} fill="none" stroke={c} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
            vectorEffect="non-scaling-stroke" />
          <circle cx={X(series.length - 1)} cy={Y(series[series.length - 1])} r={2.8} fill={c}
            vectorEffect="non-scaling-stroke" />
        </svg>
        <b className="dchart__y dmono" style={{ top: pc(T, h) }}>{yTop}</b>
        <b className="dchart__y dmono" style={{ top: pc(h - B, h) }}>{yBot}</b>
        {thr != null && <b className="dchart__r" style={{ top: pc(Y(thr), h) }}>{thrLabel ?? 'норматив'}</b>}
        {ghost && (
          <b className="dchart__r" style={{ top: pc(Y(ghost[ghost.length - 1]), h) }}>{ghostLabel ?? 'прогноз'}</b>
        )}
      </div>
      <b className="dchart__x">{xlab}</b>
    </div>
  )
}

// Спарклайн. Шкала общая на весь разрез: своя шкала у каждой строки растягивает шум
// в пилу и делает плоский ряд похожим на обвал. Сравнивать строки можно только на одной шкале.
function Spark({ series, tone, dom }: { series: number[]; tone: Tone; dom: [number, number] }) {
  const w = 60, h = 15, pad = 1.5
  const rg = (dom[1] - dom[0]) || 1
  const d = series
    .map((v, i) => (i ? 'L' : 'M') + ((i / (series.length - 1)) * w).toFixed(1) + ' '
      + (h - pad - ((v - dom[0]) / rg) * (h - pad * 2)).toFixed(1))
    .join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img">
      <path d={d} fill="none" stroke={col(tone)} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

// Значение и изменение — ДВА столбца, а не два числа в одной ячейке.
// Столбец таблицы в Power BI это одно поле, одно выравнивание и один цвет значения:
// условное форматирование красит значение целиком, покрасить половину ячейки нечем.
// «18,6 +60%» там не собирается вовсе — только склейкой в DAX, и тогда обе половины
// одного цвета, то есть знак пропадает. В DataLens ровно то же ограничение.
// Пара «столбец значения + узкий столбец Δ» воспроизводится в обоих один в один.
function Cell({ v, d, dir }: { v: string; d: number; dir: 'up-good' | 'up-bad' | 'none' }) {
  return (
    <>
      <td className="dtab__v">{v}</td>
      <td className={`dtab__dc is-${toneOf(d, dir)}`}>{pct(d)}</td>
    </>
  )
}

function Panel({ title, hint, children, className = '' }: {
  title: string; hint?: string; children: React.ReactNode; className?: string
}) {
  return (
    <div className={`dpan ${className}`}>
      <h3><span className="dpan__nm">{title}</span>{hint && <em>{hint}</em>}</h3>
      {children}
    </div>
  )
}

// Блок метрики: имя, число, изменение в процентах, график. Одинаковый для всех рядов —
// сравнение по позиции работает только на одинаковых блоках.
//
// ДВА визуала, а не один. Карточка со значением и линейный график под ней — отдельными
// контейнерами, каждый со своей рамкой. Причина не в оформлении: график внутрь карточки
// штатно не вставляется ни в одном из двух продуктов. В собственном руководстве Microsoft
// тренд на карточке рисуется SVG-картинкой, которую отдаёт мера DAX, — то есть разметку
// графика человек пишет руками, и осей у неё нет. У Индикатора DataLens нет ни графика
// внутри, ни сравнения с прошлым периодом. Слитая плитка врала бы про объём работы:
// десять метрик листа — это двадцать виджетов, и это должно быть видно с экрана.
function MetricBox({ m, alarm, xlab, onHoverNode }: { m: Metric; alarm?: boolean; xlab?: string; onHoverNode: (id: string | null) => void }) {
  const hl = alarm ? ` dpan--strong is-${m.tone}` : ''
  return (
    <div className="dtile" onMouseEnter={() => onHoverNode(m.id)} onMouseLeave={() => onHoverNode(null)}>
      <div className={`dpan dpan--card${hl}`}>
        <h3><span className="dpan__nm">{m.name}</span>{m.unit && <em>{m.unit}</em>}</h3>
        <div className="dmval dmval--stack">
          <b>{m.value}</b><span className={`dd is-${m.tone}`}>{m.delta}</span>
        </div>
      </div>
      {/* Обёртки .dchart здесь быть не должно: её рисует сам Line. Лишний контейнер
          применял поле под подписи оси (34px) дважды — график начинался с 68-го пикселя
          и на плитке в 200px терял треть ширины. */}
      <div className={`dpan dpan--chart${hl}`}>
        <Line series={m.series} tone={m.tone} dom={m.dom} thr={m.thr} thrLabel={m.thrLabel}
          ghost={m.ghost} ghostLabel={m.ghostLabel} xlab={xlab} />
      </div>
    </div>
  )
}

// Вершина заливки по Д6.3b НЕ получает, хотя изменение бывает и больше 15%: она и так самый
// крупный блок листа и всегда его предмет. Заливка на ней ничего не добавляет, а контраст
// с плитками причин съедает. Решение осознанное, в своде не записано.
function KeyBox({ m, xlab, onHoverNode }: { m: Metric; xlab?: string; onHoverNode: (id: string | null) => void }) {
  // Вершина устроена так же, как плитки: карточка и график — разные визуалы.
  // Стоят рядом, а не друг под другом: числу вершины положена ширина, и в столбик
  // они уводят весь первый экран вниз.
  return (
    <div className="dtile dtile--key"
      onMouseEnter={() => onHoverNode(m.id)} onMouseLeave={() => onHoverNode(null)}>
      <div className="dpan dpan--card">
        <h3><span className="dpan__nm">{m.name}</span>{m.unit && <em>{m.unit}</em>}</h3>
        <div className="dkey__v">
          {/* Словом помечается только ключевая метрика карты. У второго листа вершина
              своя: ключевая на карте одна, и она занята первым листом. */}
          {m.isKey && <span className="dkey__tag">ключевая метрика карты</span>}
          <b>{m.value}</b>
          <span className={`dd is-${m.tone}`}>{m.delta}</span>
        </div>
      </div>
      <div className="dpan dpan--chart">
        <Line series={m.series} tone={m.tone} h={80} w={560} xlab={xlab} />
      </div>
    </div>
  )
}

// Разрез. Заголовки колонок называют выбранную метрику прямо в шапке таблицы:
// без этого таблица не переживает скриншот — через час неизвестно, что в средних колонках.
// Разбор числа из ячейки: запятая — десятичный разделитель, разряды разделены узким
// неразрывным пробелом (Д7.5). Возвращает null на всём, что числом не является.
function num(s: string): number | null {
  const v = s.replace(/[\u202F\u00A0\s]/g, '').replace(',', '.')
  return /^-?\d+(\.\d+)?$/.test(v) ? parseFloat(v) : null
}

// Сумма колонки в том же формате, что и строки: с тем же числом знаков после запятой
// и теми же разрядными пробелами. Если хоть одна ячейка не число — итога по колонке нет.
function total(vals: string[]): string {
  const ns = vals.map(num)
  if (ns.some((n) => n === null)) return ''
  const dec = Math.max(...vals.map((v) => (v.split(',')[1] ?? '').length))
  const s = (ns as number[]).reduce((a, b) => a + b, 0).toFixed(dec).replace('.', ',')
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, '\u202F')
}

function Cut({ c, top, topDir, sel, volLabel, baseLabel }: {
  c: CutBlock
  top: string
  topDir: 'up-good' | 'up-bad' | 'none'
  sel: { short: string; dir: 'up-good' | 'up-bad' | 'none' }
  volLabel: string
  baseLabel?: string
}) {
  // Д5.2 снято 12.08.2026: спарклайны в строках необязательны. Если их нет ни у одной
  // строки — колонка не рисуется вовсе, пустой столбец «Тренд» хуже его отсутствия.
  const all = c.rows.flatMap((r) => r.series ?? [])
  const hasSpark = all.length > 0
  const dom: [number, number] = hasSpark ? [Math.min(...all), Math.max(...all)] : [0, 1]
  return (
    <Panel title={c.title} hint={c.hint}>
      <table className="dtab dtab--cut">
        <thead>
          <tr>
            <th className="dtab__c1">{c.col}</th>
            <th>{top}</th>
            <th className="dtab__dc">Δ</th>
            <th>{sel.short}</th>
            <th className="dtab__dc">Δ</th>
            <th>{c.volLabel ?? volLabel}</th>
            <th className="dtab__dc">Δ</th>
            {/* Колонка базы — только у опросных метрик: у времени ожидания анкет нет.
                Рядом доля ответивших: без неё не видно, что строки собраны разными
                машинами отбора — в чате отвечает каждый пятый, на почте каждый восьмой. */}
            {baseLabel && <th>{baseLabel}</th>}
            {hasSpark && <th className="dtab__sp">Тренд</th>}
          </tr>
        </thead>
        <tbody>
          {c.rows.map((r) => (
            <tr key={r.label} className={[r.worst && 'is-worst', r.weak && 'is-weak'].filter(Boolean).join(' ') || undefined}>
              <td className="dtab__lbl dtab__c1">{r.label}</td>
              <Cell v={r.top} d={r.dTop} dir={topDir} />
              <Cell v={r.sel} d={r.dSel} dir={sel.dir} />
              {/* Объём не красим. Он стоит в строке не для оценки, а для веса (Д3.4):
                  −25% на 130 анкетах и на 620 — разные разговоры. Рост потока сам по себе
                  не хорош и не плох (Д2.5), а раскрашенный он давал по дюжине красных
                  чисел на таблицу — на таком фоне подсветка проблемной строки терялась. */}
              <Cell v={r.vol} d={r.dVol} dir="none" />
              {baseLabel && (
                <td className="dtab__base">
                  {r.base}
                  {r.resp && <i> · {r.resp}</i>}
                </td>
              )}
              {hasSpark && (
                <td className="dtab__sp">
                  {r.series && <Spark series={r.series} tone={toneOf(r.dTop, topDir)} dom={dom} />}
                </td>
              )}
            </tr>
          ))}
        </tbody>
        {/* Итог. Есть штатной настройкой и в DataLens, и в Power BI, поэтому лист
            воспроизводится один в один. На карте-декомпозиции он не украшение:
            сумма строк обязана сойтись с вершиной, и это единственная проверка,
            которую дашборд предлагает читателю сам (Д11.5). Изменений в итоге нет —
            дельта суммы не равна сумме дельт, и печатать её значило бы врать. */}
        <tfoot>
          <tr>
            <td className="dtab__lbl dtab__c1">Итого</td>
            {/* Столбцы Δ в итоге пустые: дельта суммы не равна сумме дельт, и печатать
                её значило бы врать. В Power BI это делается настройкой «Итоги → None»
                по столбцу — штатной, то есть лист повторяется один в один. */}
            <td>{total(c.rows.map((r) => r.top))}</td>
            <td className="dtab__dc" />
            <td>{total(c.rows.map((r) => r.sel))}</td>
            <td className="dtab__dc" />
            <td>{total(c.rows.map((r) => r.vol))}</td>
            <td className="dtab__dc" />
            {baseLabel && <td />}
            {hasSpark && <td className="dtab__sp" />}
          </tr>
        </tfoot>
      </table>
    </Panel>
  )
}

/* ── «Собрать у себя». Утверждённый макет: поповер раскрывается ПОД кнопкой,
   вторая кнопка отдельная и неактивная. Описаний рядом с кнопками нет — они
   живут внутри поповера. Открытие по наведению и по клику: на тачскрине hover нет. */
function TakeAway() {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', away); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc) }
  }, [open])

  return (
    <div className="dtake">
      <div className={`dpop${open ? ' open' : ''}`} ref={box}>
        <button className="dbtn" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen(!open)}>
          <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 2.8v9.4" /><path d="m6.4 8.8 3.6 3.6 3.6-3.6" /><path d="M3.6 14.4v1.6a1.6 1.6 0 0 0 1.6 1.6h9.6a1.6 1.6 0 0 0 1.6-1.6v-1.6" />
          </svg>
          Собрать такой дашборд у себя
          <svg className="chev" width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 8.5 4 4 4-4" /></svg>
        </button>
        <div className="dpop__card" role="menu">
          <button className="dopt" role="menuitem">
            <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 2.8h5.1l4.1 4.1V17a1.6 1.6 0 0 1-1.6 1.6H6A1.6 1.6 0 0 1 4.4 17V4.4A1.6 1.6 0 0 1 6 2.8Z" /><path d="M11 3v4.2h4.2" /><path d="m9.4 10.6.75 1.7 1.7.75-1.7.75-.75 1.7-.75-1.7-1.7-.75 1.7-.75Z" />
            </svg>
            <span><b>Инструкция для ИИ<em>.md</em></b><span>Готовый промпт для ИИ. Загрузите своему агенту и он соберет такой же</span></span>
          </button>
          <button className="dopt" role="menuitem">
            <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 2.8h5.1l4.1 4.1V17a1.6 1.6 0 0 1-1.6 1.6H6A1.6 1.6 0 0 1 4.4 17V4.4A1.6 1.6 0 0 1 6 2.8Z" /><path d="M11 3v4.2h4.2" /><path d="m8.5 11.4-1.4 1.5 1.4 1.5" /><path d="m11.5 11.4 1.4 1.5-1.4 1.5" />
            </svg>
            <span><b>Инструкция для разработчика<em>.pdf</em></b><span>То же самое удобным документом для разработчика</span></span>
          </button>
        </div>
      </div>

      <button className="dbtn dbtn--soon" disabled>
        <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="9.4" cy="5" rx="5" ry="2.2" /><path d="M4.4 5v4.4c0 1.2 2.24 2.2 5 2.2h.4" /><path d="M14.4 5v3.2" /><circle cx="14.2" cy="13.6" r="3.4" /><path d="M14.2 12.2v2.8M12.8 13.6h2.8" />
        </svg>
        Подставить свои данные <span className="dtag">скоро</span>
      </button>
    </div>
  )
}

export function DashSheet({ bp, onClose, onHoverNode }: {
  bp: Blueprint
  onClose: () => void
  onHoverNode: (id: string | null) => void
}) {
  // Заливка достаётся ровно одной плитке на весь дашборд — самой сдвинувшейся.
  // Считается по обоим рядам сразу, иначе «сильнейшая» была бы своя в каждом ряду.
  const alarm = alarmId([...bp.causes, ...bp.deeper])
  const type = TYPES[bp.type]

  return (
    <aside className="dsheet">
      <div className="dsheet__head">
        <div className="dsheet__headl">
          <h2>{bp.q}</h2>
        </div>
        <div className="dsheet__headr">
          {/* Не мета-чип по Д7.8: тот запрет про кому дашборд, с каким ритмом и шагом данных —
              это живёт в документации. Здесь сказано другое: перед вами образец, собранный
              по карте, а не отчёт с настоящими числами. Без этой пометки лист читается
              как чей-то реальный дашборд, и первым вопросом становится «чьи это деньги». */}
          <span className="dsheet__tpl">Шаблон дашборда</span>
          <button className="dsheet__x" onClick={onClose} aria-label="Закрыть дашборд">×</button>
        </div>
      </div>

      <div className="dsheet__body">
        <div className="dmock">
          {/* Фильтры собраны из тех же блоков, что даёт DataLens: календарь и выпадающий
              список (кнопочного набора там нет вовсе). В Power BI это Slicer в режимах
              Between по дате и Dropdown по измерению. Один список показан раскрытым:
              иначе ось видно по имени, но не видно, из чего она состоит, а именно это
              человек и сверяет со своим учётом. Контролы некликабельны намеренно. */}
          <div className={`dmock__bar${bp.filters.some((f) => f.open) ? ' has-open' : ''}`}
            style={{ ['--dsel-pop' as string]: `${(bp.filters.find((f) => f.open)?.values?.length ?? 0) * 26 + 12}px` }}>
            <div className="dmock__sels">
            {bp.filters.map((f) => (
              <span key={f.n} className={`dsel${f.on ? ' is-first' : ''}`}>
                <span className="dsel__lab">{f.n}</span>
                <span className="dsel__box">
                  {f.kind === 'date' && <svg className="dsel__cal" viewBox="0 0 14 14" aria-hidden>
                    <rect x="1.5" y="2.5" width="11" height="10" rx="1.5" fill="none" stroke="currentColor" />
                    <path d="M1.5 5.5h11M4.5 1v2.4M9.5 1v2.4" fill="none" stroke="currentColor" />
                  </svg>}
                  <span className="dsel__val">{f.value ?? 'Все'}</span>
                  {f.kind !== 'date' && <svg className="dsel__chev" viewBox="0 0 10 6" aria-hidden>
                    <path d="M1 1.5 5 5 9 1.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
                  </svg>}
                </span>
                {f.open && f.values && (
                  <span className="dsel__pop">
                    {f.values.map((v) => (
                      <span key={v} className="dsel__opt">
                        <span className="dsel__box2" />
                        {v}
                      </span>
                    ))}
                  </span>
                )}
              </span>
            ))}
            </div>
          </div>

          <KeyBox m={bp.vertex} xlab={bp.xlab} onHoverNode={onHoverNode} />

          {/* Прямые причины. До четырёх — один ряд (Д4.4). Пять и больше в один ряд не влезают:
              плитка сжимается до 190px, название и единица переносятся, спарклайн вырождается
              в чёрточку — то есть ломаются R6.1 и R6.4. Переносим на две строки, но блок
              обводим и подписываем: перенос Д4.4 запрещало ровно затем, чтобы вторая строка
              причин не читалась как второй уровень. Обведённый блок эту путаницу снимает —
              приём взят у Д4.5, где так же разрешено выносить противовес отдельной группой. */}
          <div className={`dgroup${bp.causes.length > 4 ? ' dgroup--wrap' : ''}`}>
            <span className="dgroup__lab">прямые причины</span>
            <div className={`dgrid dgrid--${bp.causes.length > 4 ? Math.ceil(bp.causes.length / 2) : Math.max(bp.causes.length, 2)}`}>
              {bp.causes.map((m) => <MetricBox key={m.id} m={m} alarm={m.id === alarm} xlab={bp.xlab} onHoverNode={onHoverNode} />)}
            </div>
          </div>

          <div className={`dgroup${bp.deeper.length > 4 ? ' dgroup--wrap' : ''}`}>
            {/* Подпись берётся из листа, а не угадывается по числу плиток: что стоит
                в этом ряду — второй уровень, противовес, метрика объёма или всё сразу —
                знает только автор листа. Раньше подписи не было вовсе, и это было верно,
                пока на «Финансах» тут стояла одна выручка. С появлением противовеса
                (Д2.6) ряд стал разнородным, и без подписи читатель не отличает метрику,
                которая объясняет рост, от метрики, которая проверяет его на честность. */}
            {bp.deeperLab && <span className="dgroup__lab">{bp.deeperLab}</span>}
            {/* Д4.5: второй уровень и противовес — сетка 4 колонки. Число колонок здесь
                не зависит от числа плиток: кирпич обязан совпадать с рядом причин (Д4.1),
                иначе одинокий противовес растягивается на пол-экрана и читается как причина. */}
            <div className="dgrid dgrid--4">
              {bp.deeper.map((m) => <MetricBox key={m.id} m={m} alarm={m.id === alarm} xlab={bp.xlab} onHoverNode={onHoverNode} />)}
            </div>
          </div>

          {/* Переключатель метрики для разрезов. Все таблицы ниже перестраиваются под неё,
              метрика вершины остаётся в них всегда — рядом с выбранной. */}
          {/* Выпадающий список, а не набор кнопок. Кнопочный слайсер в Power BI есть,
              в DataLens его нет вовсе — там только выпадающий список, поле ввода,
              календарь и чекбокс. Берём то, что собирается в обоих. */}
          <div className="dpick">
            <span className="dsel">
              <span className="dsel__lab">Метрика для разрезов</span>
              <span className="dsel__box">
                <span className="dsel__val">{bp.cutMetrics[bp.cutSel].name}</span>
                <svg className="dsel__chev" viewBox="0 0 10 6" aria-hidden>
                  <path d="M1 1.5 5 5 9 1.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
                </svg>
              </span>
            </span>
          </div>

          {/* Каждый разрез — во всю ширину. Три пары «значение + изменение» плюс база
              и тренд в половине ширины не помещаются: дельта уезжает на вторую строку,
              и таблица становится рваной. Разрезы уходят ниже сгиба — это нормально. */}
          {bp.cuts.map((c) => (
            <Cut key={c.title} c={c} top={bp.topShort} topDir={bp.topDir} sel={bp.cutMetrics[bp.cutSel]}
              volLabel={bp.volLabel} baseLabel={bp.baseLabel} />
          ))}
        </div>

        <TakeAway />
        <p className="dnote">Цифры условные и используются для демонстрации.</p>
      </div>
    </aside>
  )
}
