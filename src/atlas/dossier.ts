// Текстовое досье метрики — то, что уезжает в буфер обмена по кнопке в подвале
// карточки. Простой текст, без разметки: его вставляют в блокнот, в переписку,
// в поле CRM и в чат с ИИ, и везде он должен читаться как есть.
//
// Markdown осознанно не делаем. Звёздочки и полные адреса ссылок раздувают досье
// до половины объёма (на «Себестоимости продаж» 2240 → 3386 знаков, из них тысяча
// на адреса), а выигрывают только в тех приёмниках, что понимают разметку.
// Простой текст в них теряет лишь жирное начертание — структура заголовков читается.
import type { AtlasNode } from './types'
import { BASE, nodeById, treeOfMetric } from './atlas'
import { roleStyle } from './style'
import { metricContent, type Dimension } from './content'
import { metricUrl } from '../site/nav'

// ── Снятие разметки хранения ───────────────────────────────────────────────────
// В полях Базы живут три вещи, которых в тексте быть не должно: перенос строки
// тегом, жирный звёздочками и явная ссылка на соседнюю метрику [[текст→id]]
// (1064 штуки в 397 карточках). Ссылка разворачивается в то слово, каким она
// стоит в предложении, — иначе текст теряет падеж.
const plain = (v?: string): string =>
  (v ?? '')
    .replace(/\[\[([^\]→]+)→[^\]]+\]\]/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/<br>/g, '\n')
    .trim()

// Поле, разбитое на пункты: каждый абзац становится строкой списка.
const bullets = (v?: string): string[] =>
  plain(v).split('\n').map((s) => s.trim()).filter(Boolean)

/** Заголовок блока и его тело. Пустое тело блок не порождает. */
const block = (title: string, body: string): string[] =>
  body.trim() ? [title, body.trim(), ''] : []

// Знак связи словами. «(+)» в тексте без легенды не читается, а «рост → рост»
// понятно без неё. У связей вида similarity знака нет.
const signWords = (sign?: string): string =>
  sign === '+' ? ' (рост → рост)' : sign === '-' ? ' (рост → спад)' : ''

/**
 * Связи метрики на том артефакте, где открыта карточка. Деление то же, что
 * в карточке связи: влияние отдельно, остальное — «связь без влияния».
 */
function edgeLines(node: AtlasNode): string[] {
  const vliyaet: string[] = []
  const zavisit: string[] = []
  const ryadom: string[] = []
  for (const e of BASE.edges) {
    const isInfluence = e.kind === 'influence'
    if (e.source === node.id) {
      const name = nodeById(e.target)?.name
      if (name) (isInfluence ? vliyaet : ryadom).push(`— ${name}${signWords(e.sign)}`)
    } else if (e.target === node.id) {
      const name = nodeById(e.source)?.name
      if (name) (isInfluence ? zavisit : ryadom).push(`— ${name}${signWords(e.sign)}`)
    }
  }
  const groups: string[][] = []
  if (vliyaet.length) groups.push(['Влияет на:', ...vliyaet])
  if (zavisit.length) groups.push(['Зависит от:', ...zavisit])
  if (ryadom.length) groups.push(['Связана без влияния:', ...ryadom])
  // Группы отделяются друг от друга пустой строкой, перед первой её нет.
  return groups.flatMap((g, i) => (i ? ['', ...g] : g))
}

/** Разрезы списком: название и чем разрез полезен. */
const dimLines = (dims: Dimension[]): string[] =>
  dims.map((d) => (d.note ? `— ${d.name} — ${d.note}` : `— ${d.name}`))

/**
 * Досье метрики одним текстом. Берёт то же, что показывает карточка, плюс связи:
 * на карте они нарисованы стрелками, а в карточке их нет, и без них выписка
 * беднее самой карты.
 */
export function metricDossier(node: AtlasNode): string {
  const c = metricContent(node.id)
  const isTree = (BASE.trees ?? []).some((t) => t.name === node.section)
  const L: string[] = []

  // ── Шапка: чем метрика называется и где стоит ──
  L.push(node.mid != null ? `${node.name}  №${String(node.mid).padStart(4, '0')}` : node.name)
  const place = `${isTree ? 'дерево' : 'карта'} «${node.section}»`
  L.push(`Атлас метрик JetMetrics · ${place}${node.group ? ` · зона «${node.group}»` : ''}`)
  L.push('')

  // ── Служебное: роль, единица, суть, другие имена ──
  L.push(`Роль: ${roleStyle(node.role).label}`)
  if (node.units) L.push(`Единица: ${node.units}`)
  if (node.label) L.push(`Разрез: ${node.label}`)
  const essence = c['Суть']
  if (essence) {
    const note = c['Суть · пояснение']
    L.push(`Суть: ${essence}${note ? ` — ${note}` : ''}`)
  }
  if (c['Синонимы']) L.push(`Она же: ${plain(c['Синонимы'])}`)
  if (c['EN']) L.push(`EN: ${plain(c['EN'])}`)
  L.push('')

  // ── Содержание карточки. Порядок тот же, что на вкладках: сначала суть,
  //    потом расчёт, потом границы применения. ──
  L.push(...block('ОПИСАНИЕ', plain(c['Описание'] || node.description)))
  L.push(...block('ФОРМУЛА', plain(c['Формула'] || node.formula)))
  L.push(...block('НЮАНСЫ РАСЧЁТА', bullets(c['Нюансы расчёта']).map((s) => `— ${s}`).join('\n')))
  L.push(...block('ПРИМЕР РАСЧЁТА', plain(c['Пример расчёта'])))
  L.push(...block('ВАЖНОСТЬ', plain(c['Важность'])))
  // Поле есть не у всех метрик (786 из 950) — пустой заголовок не выводим.
  L.push(...block('КОГДА НЕ НУЖНА', plain(c['Когда не нужна'])))
  L.push(...block('РАЗРЕЗЫ', dimLines(c['Разрезы'] ?? []).join('\n')))
  L.push(...block(isTree ? 'СВЯЗИ В ДЕРЕВЕ' : 'СВЯЗИ НА КАРТЕ', edgeLines(node).join('\n')))

  // ── Хвост: куда вернуться за первоисточником ──
  const tree = treeOfMetric(node)
  if (tree) L.push(`Разбирается деревом «${tree.name}».`)
  const url = metricUrl(node.section, node.id)
  L.push(`Источник: Атлас метрик JetMetrics · ${url.startsWith('http') ? url : window.location.origin + url}`)

  return L.join('\n')
}
