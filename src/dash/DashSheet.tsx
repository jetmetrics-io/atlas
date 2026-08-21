// Дашборд, собранный из карты метрик. Десять блоков, три формы: число с графиком,
// таблица, столбики. Порядок блоков повторяет путь разбора — от «есть ли проблема»
// до «над чем работать в первую очередь», — но подписей-шагов на экране нет:
// экран читается сверху вниз сам.
//
// Цвет кодирует состояние метрики, а не её важность. Ни служебных комментариев,
// ни коридора нормы, ни второй оси Y. Подсказки «почему так» сняты до пересборки:
// тексты остались в blueprints.ts (поле tip), на экран они пока не выводятся.
import type { Blueprint, CutBlock, Metric, Tone } from './blueprints'
import { TYPES, pct, toneOf, alarmId } from './blueprints'
import { TypeIcon } from './icons'

// Линии и точки — не текст: для них порог AA 3:1, фирменные цвета проходят.
// Текстовые подписи графика живут в HTML и красятся из --d-faint (см. dash.css).
const C = { bad: '#DC4048', good: '#0E9C7D', flat: '#B4BCC1', grid: '#EDF0F2', line: '#C9D0D4', faint: '#9AA2A8', muted: '#656E74' }
const col = (t: Tone) => (t === 'bad' ? C.bad : t === 'good' ? C.good : C.flat)
const fmt = (x: number, mx: number) =>
  mx < 10 ? x.toFixed(1).replace('.', ',') : mx > 1000 ? (Math.round(x / 100) * 100).toLocaleString('ru-RU') : String(Math.round(x))

// ── Линия. Ось Y подписана крайними значениями, ось X — единицей времени, а не н1…н8.
// ghost — вторая, служебная линия пунктиром: прогноз на графике факта. Отдельным блоком
// прогнозный узел не ставится (прогноз не вызывает факт), а расстояние между линиями —
// это ровно то, что мерит отдельная метрика карты.
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
  return (
    <div className="dchart">
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
        <b className="dchart__y dmono" style={{ top: pc(T, h) }}>{fmt(max, max)}</b>
        <b className="dchart__y dmono" style={{ top: pc(h - B, h) }}>{fmt(min, max)}</b>
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

// Ячейка «значение + изменение». Дельта живёт внутри той же ячейки, а не отдельной
// колонкой: три величины в строке иначе не помещаются без потери базы или спарклайна.
function Cell({ v, d, dir }: { v: string; d: number; dir: 'up-good' | 'up-bad' | 'none' }) {
  return (
    <td>
      <span className="dtab__v">{v}</span>
      <span className={`dtab__d is-${toneOf(d, dir)}`}>{pct(d)}</span>
    </td>
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
function MetricBox({ m, alarm, onHoverNode }: { m: Metric; alarm?: boolean; onHoverNode: (id: string | null) => void }) {
  return (
    <div className={`dpan${alarm ? ` dpan--strong is-${m.tone}` : ''}`}
      onMouseEnter={() => onHoverNode(m.id)} onMouseLeave={() => onHoverNode(null)}>
      <h3><span className="dpan__nm">{m.name}</span>{m.unit && <em>{m.unit}</em>}</h3>
      <div className="dmval">
        <b>{m.value}</b><span className={`dd is-${m.tone}`}>{m.delta}</span>
      </div>
      <div className="dchart">
        <Line series={m.series} tone={m.tone} dom={m.dom} thr={m.thr} thrLabel={m.thrLabel}
          ghost={m.ghost} ghostLabel={m.ghostLabel} />
      </div>
    </div>
  )
}

// Вершина заливки по Д6.3b НЕ получает, хотя изменение бывает и больше 15%: она и так самый
// крупный блок листа и всегда его предмет. Заливка на ней ничего не добавляет, а контраст
// с плитками причин съедает. Решение осознанное, в своде не записано.
function KeyBox({ m, onHoverNode }: { m: Metric; onHoverNode: (id: string | null) => void }) {
  return (
    <div className="dpan" onMouseEnter={() => onHoverNode(m.id)} onMouseLeave={() => onHoverNode(null)}>
      <h3><span className="dpan__nm">{m.name}</span>{m.unit && <em>{m.unit}</em>}</h3>
      <div className="dkey">
        <div className="dkey__v">
          {/* Словом помечается только ключевая метрика карты. У второго листа вершина
              своя: ключевая на карте одна, и она занята первым листом. */}
          {m.isKey && <span className="dkey__tag">ключевая метрика карты</span>}
          <b>{m.value}</b>
          <span className={`dd is-${m.tone}`}>{m.delta}</span>
        </div>
        <div className="dkey__c"><Line series={m.series} tone={m.tone} h={80} w={560} /></div>
      </div>
    </div>
  )
}

// Разрез. Заголовки колонок называют выбранную метрику прямо в шапке таблицы:
// без этого таблица не переживает скриншот — через час неизвестно, что в средних колонках.
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
            <th>{sel.short}</th>
            <th>{volLabel}</th>
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
      </table>
    </Panel>
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
          <div className="dsheet__meta">
            <span className="dchip dchip--type">
              <TypeIcon type={bp.type} size={14} /> {type.chip}
            </span>
          </div>
        </div>
        <div className="dsheet__headr">
          <span className="dsheet__demo">цифры для примера · названия метрик из карты</span>
          <button className="dsheet__x" onClick={onClose} aria-label="Закрыть дашборд">×</button>
        </div>
      </div>

      <div className="dsheet__body">
        <div className="dmock">
          <div className="dmock__bar">
            <span className="dmock__barlab">рекомендуемые фильтры</span>
            {bp.filters.map((f) => (
              <span key={f.n} className={`dcut${f.on ? ' is-first' : ''}`}>{f.n}</span>
            ))}
          </div>

          <KeyBox m={bp.vertex} onHoverNode={onHoverNode} />

          <div className="dgrid dgrid--3">
            {bp.causes.map((m) => <MetricBox key={m.id} m={m} alarm={m.id === alarm} onHoverNode={onHoverNode} />)}
          </div>

          <div className="dgrid dgrid--4">
            {bp.deeper.map((m) => <MetricBox key={m.id} m={m} alarm={m.id === alarm} onHoverNode={onHoverNode} />)}
          </div>

          {/* Переключатель метрики для разрезов. Все таблицы ниже перестраиваются под неё,
              метрика вершины остаётся в них всегда — рядом с выбранной. */}
          <div className="dpick">
            <span className="dpick__lab">Метрика для разрезов</span>
            {bp.cutMetrics.map((m, i) => (
              <span key={m.name} className={`dcut${i === bp.cutSel ? ' is-first' : ''}`}>{m.short}</span>
            ))}
          </div>

          {/* Каждый разрез — во всю ширину. Три пары «значение + изменение» плюс база
              и тренд в половине ширины не помещаются: дельта уезжает на вторую строку,
              и таблица становится рваной. Разрезы уходят ниже сгиба — это нормально. */}
          {bp.cuts.map((c) => (
            <Cut key={c.title} c={c} top={bp.topShort} topDir={bp.topDir} sel={bp.cutMetrics[bp.cutSel]}
              volLabel={bp.volLabel} baseLabel={bp.baseLabel} />
          ))}
        </div>
      </div>
    </aside>
  )
}
