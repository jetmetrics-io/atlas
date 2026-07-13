import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export interface TourStep {
  title: string
  body: React.ReactNode
  // Элемент-якорь для спотлайта. Пересчитывается на каждом шаге (после before).
  anchor: () => Element | null
  // Побочные действия перед показом шага (центрировать карту, показать «i», сменить режим).
  before?: () => void
  // Доп. отступ выреза вокруг якоря.
  pad?: number
}

const prefersReducedMotion = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

// Спотлайт-тур: затемнение с «дыркой» вокруг якоря + карточка-подсказка.
export function Tour({ steps, onClose }: { steps: TourStep[]; onClose: (done: boolean) => void }) {
  const [i, setI] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const [cardPos, setCardPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 })

  const step = steps[i]
  const isLast = i === steps.length - 1

  const finish = (done: boolean) => onClose(done)
  const next = () => (isLast ? finish(true) : setI((v) => v + 1))
  const prev = () => setI((v) => Math.max(0, v - 1))

  // Запускаем побочные действия шага и замеряем якорь (с повторами — узел мог
  // ещё ехать после центрирования, «i» — дорисоваться).
  useEffect(() => {
    step.before?.()
    let raf = 0
    const timers: number[] = []
    const measure = () => {
      const el = step.anchor()
      setRect(el ? el.getBoundingClientRect() : null)
    }
    raf = requestAnimationFrame(measure)
    ;[120, 320, 520].forEach((t) => timers.push(window.setTimeout(measure, t)))
    const onResize = () => measure()
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onResize, true)
    return () => {
      cancelAnimationFrame(raf)
      timers.forEach(clearTimeout)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onResize, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i])

  // Позиционируем карточку СБОКУ от якоря, чтобы не перекрывать объясняемый элемент.
  // Порядок предпочтения: справа → слева → снизу → сверху; берём первое, что влезает
  // целиком. По центру экрана — если якоря нет.
  useLayoutEffect(() => {
    const vw = window.innerWidth, vh = window.innerHeight
    const M = 14, gap = 14
    const cw = cardRef.current?.offsetWidth ?? 320
    // Высота карточки ограничена вьюпортом (внутри — прокрутка тела), чтобы кнопки
    // всегда были видны даже у длинного шага.
    const ch = Math.min(cardRef.current?.offsetHeight ?? 180, vh - 2 * M)
    if (!rect) {
      setCardPos({ left: (vw - cw) / 2, top: (vh - ch) / 2 })
      return
    }
    const clampV = (t: number) => Math.min(Math.max(M, t), vh - ch - M)
    const clampH = (l: number) => Math.min(Math.max(M, l), vw - cw - M)
    const midV = clampV(rect.top + rect.height / 2 - ch / 2)
    const midH = clampH(rect.left + rect.width / 2 - cw / 2)
    const cands = [
      { left: rect.right + gap, top: midV, fits: rect.right + gap + cw + M <= vw },   // справа
      { left: rect.left - gap - cw, top: midV, fits: rect.left - gap - cw >= M },      // слева
      { left: midH, top: rect.bottom + gap, fits: rect.bottom + gap + ch + M <= vh },  // снизу
      { left: midH, top: rect.top - gap - ch, fits: rect.top - gap - ch >= M },        // сверху
    ]
    const pick = cands.find((c) => c.fits)
    // Крайний случай (нигде не влезает без перекрытия) — прижимаем к низу по центру.
    setCardPos(pick ? { left: pick.left, top: pick.top } : { left: midH, top: vh - ch - M })
  }, [rect, i])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); finish(false) }
      else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); next() }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); prev() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, isLast])

  const pad = step.pad ?? 8
  const noMotion = prefersReducedMotion()

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label={`Подсказка ${i + 1} из ${steps.length}: ${step.title}`}>
      {/* Клик-ловушка: клик мимо карточки = пропустить */}
      <div className="tour__catch" onClick={() => finish(false)} />
      {/* Затемнение с вырезом (box-shadow-дырка) или сплошное, если якоря нет */}
      {rect ? (
        <div
          className="tour__hole"
          style={{
            left: rect.left - pad, top: rect.top - pad,
            width: rect.width + pad * 2, height: rect.height + pad * 2,
            transition: noMotion ? 'none' : undefined,
          }}
        />
      ) : (
        <div className="tour__dimfull" />
      )}

      <div className="tour__card" ref={cardRef} style={{ left: cardPos.left, top: cardPos.top }} onClick={(e) => e.stopPropagation()}>
        <div className="tour__step">Шаг {i + 1} из {steps.length}</div>
        <h3 className="tour__title">{step.title}</h3>
        <div className="tour__body">{step.body}</div>
        <div className="tour__foot">
          <div className="tour__dots">
            {steps.map((_, k) => (
              <span key={k} className={`tour__dot${k === i ? ' is-on' : ''}`} />
            ))}
          </div>
          <div className="tour__ctl">
            <button className="tour__skip" onClick={() => finish(false)}>Пропустить</button>
            <div className="tour__nav">
              {i > 0 && <button className="tour__btn" onClick={prev}>Назад</button>}
              <button className="tour__btn tour__btn--primary" onClick={next}>
                {isLast ? 'Готово' : 'Далее'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
