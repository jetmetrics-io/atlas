import type { ReactNode } from 'react'
import type { AtlasEdge } from '../atlas/types'
import { nodeById } from '../atlas/atlas'
import { signColor, edgeLabel } from '../atlas/style'

export function EdgeCard({ edge, onClose, onNavigate }: {
  edge: AtlasEdge
  onClose: () => void
  onNavigate?: (id: string) => void
}) {
  const a = nodeById(edge.source)
  const b = nodeById(edge.target)
  const color = signColor(edge.sign)

  const link = (id: string, name?: string): ReactNode =>
    onNavigate
      ? <a className="metriclink" onClick={() => onNavigate(id)}>{name}</a>
      : <b>{name}</b>

  const A = link(edge.source, a?.name)
  const B = link(edge.target, b?.name)

  // Пер-связевый разбор простым языком. Влияние: «чем больше A — тем больше/меньше B».
  // Ассоциация (пунктир): наблюдение, а не рычаг.
  const howToRead: ReactNode = edge.kind === 'influence'
    ? (edge.sign === '+'
        ? <>Чем больше {A}, тем, при прочих равных, больше {B}.</>
        : <>Чем больше {A}, тем, при прочих равных, меньше {B}.</>)
    : (edge.sign === '+'
        ? <>Когда растёт {A}, обычно растёт и {B}. Но это наблюдение, а не рычаг: менять {A}, чтобы поднять {B}, скорее всего не сработает.</>
        : <>Когда растёт {A}, {B}, как правило, меньше. Но это наблюдение, а не рычаг: менять {A}, чтобы сдвинуть {B}, скорее всего не сработает.</>)

  return (
    <aside className="panel">
      <button className="panel__close" onClick={onClose} aria-label="Закрыть">×</button>
      <div className="panel__head">
        <span className="panel__role" style={{ color }}>
          <span className="conn-sign" style={{ color }}>{edge.sign}</span>
          {edgeLabel(edge.sign, edge.kind)}
        </span>
        <h2 className="panel__name" style={{ fontSize: '1.05rem' }}>
          {a?.name} <span style={{ color }}>→</span> {b?.name}
        </h2>
      </div>
      <div className="panel__body">
        <div className="panel__section">
          <div className="panel__label">Как читать</div>
          <div className="panel__text">{howToRead}</div>
        </div>
        <div className="panel__section">
          <div className="panel__label">Тип связи</div>
          <div className="conn-row">
            <span className="conn-sign" style={{ color }}>{edge.sign}</span>
            <span>{edge.sign === '+' ? 'Прямая: рост → рост' : 'Обратная: рост → спад'}</span>
          </div>
          <div className="conn-row">
            <span style={{ width: 18, textAlign: 'center', flex: 'none' }}>
              <span style={{ display: 'inline-block', width: 16, borderTop: `2px ${edge.kind === 'associative' ? 'dashed' : 'solid'} ${color}` }} />
            </span>
            <span>{edge.kind === 'influence' ? 'Влияние (на первую можно нажать)' : 'Связь без влияния (только наблюдать)'}</span>
          </div>
        </div>
        <div className="panel__section">
          <div className="panel__label">Оговорка</div>
          <div className="panel__text" style={{ color: 'var(--jm-muted)' }}>
            Знак связи взят из ручной разметки атласа и не проверен на ваших данных. В части случаев он
            переворачивается в зависимости от условий — это уточним отдельно.
          </div>
        </div>
      </div>
    </aside>
  )
}
