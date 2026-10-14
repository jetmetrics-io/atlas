import type { ReactNode } from 'react'
import type { AtlasEdge } from '../atlas/types'
import { nodeById } from '../atlas/atlas'
import { signColor, edgeLabel } from '../atlas/style'
import { t, rich } from '../i18n'

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
  const ab = { a: A, b: B }
  const howToRead: ReactNode = edge.kind === 'influence'
    ? (edge.sign === '+'
        ? rich('Чем больше {a}, тем, при прочих равных, больше {b}.', ab)
        : rich('Чем больше {a}, тем, при прочих равных, меньше {b}.', ab))
    : (edge.sign === '+'
        ? rich('Когда растёт {a}, обычно растёт и {b}. Но это наблюдение, а не рычаг: менять {a}, чтобы поднять {b}, скорее всего не сработает.', ab)
        : rich('Когда растёт {a}, {b}, как правило, меньше. Но это наблюдение, а не рычаг: менять {a}, чтобы сдвинуть {b}, скорее всего не сработает.', ab))

  return (
    <aside className="panel">
      <button className="panel__close" onClick={onClose} aria-label={t('Закрыть')}>×</button>
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
          <div className="panel__label">{t('Как читать')}</div>
          <div className="panel__text">{howToRead}</div>
        </div>
        <div className="panel__section">
          <div className="panel__label">{t('Тип связи')}</div>
          <div className="conn-row">
            <span className="conn-sign" style={{ color }}>{edge.sign}</span>
            <span>{edge.sign === '+' ? t('Прямая: рост → рост') : t('Обратная: рост → спад')}</span>
          </div>
          <div className="conn-row">
            <span style={{ width: 18, textAlign: 'center', flex: 'none' }}>
              <span style={{ display: 'inline-block', width: 16, borderTop: `2px ${edge.kind === 'associative' ? 'dashed' : 'solid'} ${color}` }} />
            </span>
            <span>{edge.kind === 'influence' ? t('Влияние (на первую можно нажать)') : t('Связь без влияния (только наблюдать)')}</span>
          </div>
        </div>
      </div>
    </aside>
  )
}
