import type { GraphEdge } from '../graph/types'
import { getNode } from '../graph/load'
import { edgeVisual, KIND_LABEL, TOKENS } from '../flow/tokens'

// смысл оператора тождества
const OP_MEANING: Record<string, string> = {
  term: 'слагаемое (+) в формуле',
  subtrahend: 'вычитаемое (−) в формуле',
  factor: 'множитель (×) в формуле',
  stage: 'стадия (× на конверсию)',
  complement: 'дополнение (1 − …)',
}
const SIGN_MEANING: Record<string, string> = {
  '+': 'усиливает — растёт X, растёт Y',
  '-': 'ослабляет — растёт X, падает Y',
  conditional: 'знак зависит от условия (см. ниже)',
}
const STRENGTH_RU: Record<string, string> = { weak: 'слабая', medium: 'средняя', strong: 'сильная' }
const CONF_RU: Record<string, string> = { low: 'низкая', medium: 'средняя', high: 'высокая' }

function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 13 }}>
      <div style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '.07em', textTransform: 'uppercase', color: TOKENS.muted, marginBottom: 5 }}>{title}</div>
      <div style={{ fontSize: 12.5, lineHeight: 1.45, color: TOKENS.text }}>{children}</div>
    </div>
  )
}

export function ConnectionCard({ edge, onClose, onPick }: { edge: GraphEdge; onClose: () => void; onPick: (id: string) => void }) {
  const vis = edgeVisual(edge.kind, edge.sign, edge.op)
  const src = getNode(edge.source)!
  const tgt = getNode(edge.target)!
  const isIdentity = edge.kind === 'identity'
  const isInfluence = edge.kind === 'influence'
  const isAssoc = edge.kind === 'associative'
  const glyph = isIdentity ? '=' : isAssoc ? '~' : '→'

  const NameChip = ({ id, ru }: { id: string; ru: string }) => (
    <span onClick={() => onPick(id)} style={{ cursor: 'pointer', fontWeight: 600, borderBottom: `1px dotted ${TOKENS.muted}` }}>{ru}</span>
  )

  return (
    <aside style={{ position: 'absolute', top: 14, right: 14, bottom: 14, width: 350, background: '#fff', border: `1px solid ${TOKENS.border}`, borderRadius: 14, boxShadow: '0 8px 30px rgba(31,42,55,.12)', padding: '18px 18px 20px', overflowY: 'auto', zIndex: 10, fontFamily: TOKENS.fontUI }}>
      <button onClick={onClose} style={{ position: 'absolute', top: 12, right: 12, border: 'none', background: 'transparent', fontSize: 18, color: TOKENS.muted, cursor: 'pointer' }}>×</button>

      {/* модальность */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontFamily: TOKENS.fontMono, fontWeight: 700, fontSize: 18, color: vis.color }}>{vis.label}</span>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: vis.color }}>
          {KIND_LABEL[edge.kind]}
        </span>
      </div>

      {/* пара X → Y */}
      <div style={{ fontSize: 15, lineHeight: 1.35, marginBottom: 6, paddingRight: 14 }}>
        <NameChip id={edge.source} ru={src.ru} /> <span style={{ color: vis.color, fontFamily: TOKENS.fontMono, fontWeight: 700 }}>{glyph}</span> <NameChip id={edge.target} ru={tgt.ru} />
      </div>

      {/* тип утверждения */}
      {isIdentity && (
        <div style={{ padding: '10px 12px', background: '#fffdf2', border: '1px solid #f4e6a8', borderRadius: 9, fontSize: 12, color: '#7a6a1f', lineHeight: 1.4, marginBottom: 14 }}>
          <b>Тождество — арифметика, верно по определению.</b> {src.ru} — {OP_MEANING[edge.op ?? ''] ?? 'компонент формулы'} {tgt.ru}. Крутить нельзя: это не рычаг, а часть расчёта.
        </div>
      )}
      {isInfluence && (
        <Sec title="Знак">{SIGN_MEANING[edge.sign] ?? edge.sign}</Sec>
      )}
      {isAssoc && (
        <div style={{ padding: '10px 12px', background: '#f1f4f8', borderRadius: 9, fontSize: 12, color: TOKENS.text, lineHeight: 1.4, marginBottom: 14 }}>
          <b>Ассоциация — связаны, но стрелку не утверждаем.</b> Общий драйвер или обратная причинность. Вмешательство в {src.ru} <b>не гарантирует</b> сдвиг {tgt.ru}.
        </div>
      )}

      {isInfluence && edge.mechanism && <Sec title="Механизм">{edge.mechanism}</Sec>}

      {edge.flip && (
        <div style={{ padding: '10px 12px', background: '#fff7e6', border: '1px solid #f0d78a', borderRadius: 9, marginBottom: 14 }}>
          <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: '#b8860b', marginBottom: 4 }}>↺ что переворачивает знак</div>
          <div style={{ fontSize: 12, color: '#7a6a1f', lineHeight: 1.4 }}>{edge.flip}</div>
        </div>
      )}

      {/* сила / уверенность / провенанс */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 14 }}>
        {isInfluence && <span style={{ fontSize: 10, background: '#f1f4f8', borderRadius: 5, padding: '2px 7px', color: TOKENS.text }}>сила: {STRENGTH_RU[edge.strength]}</span>}
        <span style={{ fontSize: 10, background: '#f1f4f8', borderRadius: 5, padding: '2px 7px', color: TOKENS.text }}>уверенность: {CONF_RU[edge.confidence]}</span>
        <span style={{ fontSize: 10, borderRadius: 5, padding: '2px 7px', ...(edge.provenance === 'curated'
          ? { background: '#e8f6f1', color: '#0E9C7D' }
          : { background: '#f3eefb', color: '#7c5bd0' }) }}>
          {edge.provenance === 'curated' ? 'выверено' : 'черновик'}
        </span>
      </div>

      {/* honesty-мост */}
      {!isIdentity && (
        <div style={{ fontSize: 11.5, color: TOKENS.muted, lineHeight: 1.45, borderTop: `1px solid ${TOKENS.bg}`, paddingTop: 12 }}>
          Это <b>предположение</b>, а не факт на ваших данных. Знак и сила зависят от вашего сегмента и способа замера — их можно подтвердить только на вашей когорте.
        </div>
      )}
    </aside>
  )
}
