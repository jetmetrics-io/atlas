import { useState } from 'react'
import type { GraphNode } from '../graph/types'
import { getNode, inEdges, outEdges } from '../graph/load'
import { CTRL_COLOR, CTRL_LABEL, edgeVisual, KIND_LABEL, TOKENS } from '../flow/tokens'

const QTY: Record<string, string> = {
  count: 'количество', money: 'деньги', ratio: 'отношение', percent: '%', per_unit: 'на единицу', score: 'индекс', duration: 'время',
}
const ESS: Record<string, string> = { more_better: 'больше — лучше', less_better: 'меньше — лучше', band: 'целевой диапазон' }
// роль метрики (что это по назначению) — отдельно от управляемости (можно ли крутить)
const ROLE_DEF: Record<string, string> = { diagnostic: 'диагностика', cost: 'затрата', result: 'результат', actionable: 'действие', guardrail: 'ограничитель' }
const SECTION_RU: Record<string, string> = {
  engagement: 'вовлечённость', acquisition: 'привлечение', retention: 'удержание', expansion: 'расширение',
  pricing: 'ценообразование', billing: 'биллинг', activation: 'активация', support: 'поддержка',
  virality: 'виральность', unit_econ: 'юнит-экономика', segment: 'сегменты', revenue_core: 'выручка', other: 'прочее',
}

function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 13 }}>
      <div style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '.07em', textTransform: 'uppercase', color: TOKENS.muted, marginBottom: 5 }}>{title}</div>
      <div style={{ fontSize: 12.5, lineHeight: 1.45, color: TOKENS.text }}>{children}</div>
    </div>
  )
}

export function MetricCard({ node, onClose, onPick, onDrillTree }: { node: GraphNode; onClose: () => void; onPick: (id: string) => void; onDrillTree?: (id: string) => void }) {
  const [details, setDetails] = useState(false)
  const outs = outEdges(node.id)
  const ins = inEdges(node.id)

  const EdgeRow = ({ otherId, kind, sign, op, mechanism, flip, dir }: any) => {
    const vis = edgeVisual(kind, sign, op)
    const other = getNode(otherId)!
    const isInfluence = kind === 'influence'
    return (
      <div style={{ display: 'flex', gap: 7, alignItems: 'baseline', marginBottom: (details || flip) ? 6 : 3 }}>
        <span style={{ fontFamily: TOKENS.fontMono, fontWeight: 700, color: vis.color, width: 12, flexShrink: 0 }}>{vis.label}</span>
        <div>
          <span onClick={() => onPick(otherId)} style={{ cursor: 'pointer', borderBottom: `1px dotted ${TOKENS.muted}` }}>
            {dir === 'out' ? '→ ' : '← '}{other.ru}
          </span>
          <span style={{ color: TOKENS.muted, fontSize: 10, marginLeft: 6 }}>{KIND_LABEL[kind as keyof typeof KIND_LABEL]}</span>
          {/* механизм — во «второй уровень»; переворот знака — всегда (ключевой актив, ICP-панель P2) */}
          {details && mechanism && <div style={{ color: TOKENS.muted, fontSize: 11, marginTop: 1 }}>{mechanism}</div>}
          {flip && <div style={{ color: '#b8860b', fontSize: 11, marginTop: 2, lineHeight: 1.35 }}>↺ что переворачивает знак: {flip}</div>}
          {isInfluence && !details && mechanism && <div style={{ color: TOKENS.muted, fontSize: 10.5, marginTop: 1 }}>{mechanism}</div>}
        </div>
      </div>
    )
  }

  return (
    <aside style={{ position: 'absolute', top: 14, right: 14, bottom: 14, width: 350, background: '#fff', border: `1px solid ${TOKENS.border}`, borderRadius: 14, boxShadow: '0 8px 30px rgba(31,42,55,.12)', padding: '18px 18px 20px', overflowY: 'auto', zIndex: 10, fontFamily: TOKENS.fontUI }}>
      <button onClick={onClose} style={{ position: 'absolute', top: 12, right: 12, border: 'none', background: 'transparent', fontSize: 18, color: TOKENS.muted, cursor: 'pointer' }}>×</button>

      <div style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.2, paddingRight: 16 }}>{node.ru}</div>
      <div style={{ fontSize: 11, fontFamily: TOKENS.fontMono, color: TOKENS.muted, marginBottom: 10 }}>{node.en} · {SECTION_RU[node.section] ?? node.section}</div>

      {/* ЧТО это — определение простым языком (главный запрос: карточка должна объяснять показатель) */}
      {node.description && (
        <div style={{ fontSize: 13.5, lineHeight: 1.5, color: TOKENS.text, marginBottom: 13 }}>{node.description}</div>
      )}

      {onDrillTree && (
        <button onClick={() => onDrillTree(node.id)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 14, fontSize: 12, fontWeight: 600, color: '#fff', background: '#0E9C7D', border: 'none', borderRadius: 8, padding: '7px 12px', cursor: 'pointer', fontFamily: TOKENS.fontUI }}>
          Дерево метрики →
        </button>
      )}

      {/* Уровень 1: суть — управляемость + направление «лучше», по желанию Goodhart */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 14 }}>
        {/* роль (что это по назначению) — не дублируем, если совпадает с управляемостью по слову */}
        {ROLE_DEF[node.role_default] && ROLE_DEF[node.role_default] !== CTRL_LABEL[node.controllability] && <span style={{ fontSize: 10, background: '#eef1f5', borderRadius: 5, padding: '2px 7px', color: TOKENS.text, fontWeight: 600 }}>{ROLE_DEF[node.role_default]}</span>}
        {/* управляемость (можно ли крутить) */}
        <span style={{ fontSize: 10, borderRadius: 5, padding: '2px 7px', color: CTRL_COLOR[node.controllability], border: `1px solid ${CTRL_COLOR[node.controllability]}55` }}>
          {CTRL_LABEL[node.controllability]}
        </span>
        <span style={{ fontSize: 10, background: '#f1f4f8', borderRadius: 5, padding: '2px 7px', color: TOKENS.text }}>{ESS[node.essence]}</span>
        {node.goodhart_risk === 'high' && <span style={{ fontSize: 10, borderRadius: 5, padding: '2px 7px', background: '#fff7e6', color: '#b8860b' }}>⚠️ опасно как цель</span>}
      </div>

      {node.formula && <Sec title="Формула"><code style={{ fontFamily: TOKENS.fontMono, fontSize: 11.5 }}>{node.formula}</code></Sec>}
      {node.why && <Sec title="Почему важно">{node.why}</Sec>}

      {outs.length > 0 && (
        <Sec title="На что влияет / из чего складывается">
          {outs.map((e) => <EdgeRow key={e.target} otherId={e.target} kind={e.kind} sign={e.sign} op={e.op} mechanism={e.mechanism} flip={e.flip} dir="out" />)}
        </Sec>
      )}
      {ins.length > 0 && (
        <Sec title="Кто влияет на неё / её компоненты">
          {ins.map((e) => <EdgeRow key={e.source} otherId={e.source} kind={e.kind} sign={e.sign} op={e.op} mechanism={e.mechanism} flip={e.flip} dir="in" />)}
        </Sec>
      )}

      {/* Уровень 2: морфология + honesty — по запросу */}
      <button onClick={() => setDetails((d) => !d)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: TOKENS.muted, background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 4, fontFamily: TOKENS.fontUI }}>
        <span>Подробнее</span><span>{details ? '▾' : '▸'}</span>
      </button>

      {details && (
        <div style={{ marginTop: 10 }}>
          <Sec title="Морфология">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {[QTY[node.quantity_type], node.additivity === 'ext' ? 'складывается' : 'не складывается', node.grain].map((t, i) => (
                <span key={i} style={{ fontSize: 10, background: '#f1f4f8', borderRadius: 5, padding: '2px 7px', color: TOKENS.text }}>{t}</span>
              ))}
            </div>
          </Sec>
          <div style={{ padding: '10px 12px', background: '#fffdf2', border: '1px solid #f4e6a8', borderRadius: 9, fontSize: 11.5, color: '#7a6a1f', lineHeight: 1.4 }}>
            Тождества (=) верны всегда. Влияния (+/−) и ассоциации (~) — предположения, не проверены на ваших данных.
          </div>
        </div>
      )}
    </aside>
  )
}
