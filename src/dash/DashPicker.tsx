// Выбор вопроса. Тип листа НЕ спрашиваем: человек не обязан знать классификацию,
// а хорошо сформулированный вопрос уже несёт в себе момент и определяет тип.
// Тип показываем рядом — иконкой и словами, чтобы он читался, а не угадывался.
import { BLUEPRINTS, QUESTIONS, TYPES } from './blueprints'
import { TypeIcon } from './icons'

export function DashPicker({ section, onPick, onClose }: {
  section: string
  onPick: (id: string) => void
  onClose: () => void
}) {
  const list = QUESTIONS[section] ?? []
  return (
    <div className="dashscrim" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="dashpicker" role="dialog" aria-label="Выбор вопроса для дашборда">
        <button className="dashpicker__x" onClick={onClose} aria-label="Закрыть">×</button>
        <header>
          <h2>Выберите задачу, под которую нужен дашборд</h2>
        </header>
        <div className="dashpicker__list">
          {list.map((q) => {
            const t = TYPES[q.type]
            return (
              <button
                key={q.id}
                className={`dashq dashq--${q.type}`}
                onClick={() => BLUEPRINTS[q.id] && onPick(q.id)}
              >
                <span className="dashq__ic"><TypeIcon type={q.type} size={17} /></span>
                <span className="dashq__txt">
                  <b>{q.q}</b>
                  <small>{q.s}</small>
                </span>
                <span className="dashq__type">
                  <i>{t.name}</i>
                  <em>{t.hint}</em>
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
