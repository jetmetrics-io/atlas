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
import { LANG, t } from '../i18n'

// Маркер пункта и разделитель «название — пояснение». В английском тексте тире
// как знак препинания не ставим: пункт — дефис, пояснение — после двоеточия.
const LI = LANG === 'en' ? '- ' : '— '
const SEP = LANG === 'en' ? ': ' : ' — '

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
  sign === '+' ? t(' (рост → рост)') : sign === '-' ? t(' (рост → спад)') : ''

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
      if (name) (isInfluence ? vliyaet : ryadom).push(`${LI}${name}${signWords(e.sign)}`)
    } else if (e.target === node.id) {
      const name = nodeById(e.source)?.name
      if (name) (isInfluence ? zavisit : ryadom).push(`${LI}${name}${signWords(e.sign)}`)
    }
  }
  const groups: string[][] = []
  if (vliyaet.length) groups.push([t('Влияет на:'), ...vliyaet])
  if (zavisit.length) groups.push([t('Зависит от:'), ...zavisit])
  if (ryadom.length) groups.push([t('Связана без влияния:'), ...ryadom])
  // Группы отделяются друг от друга пустой строкой, перед первой её нет.
  return groups.flatMap((g, i) => (i ? ['', ...g] : g))
}

/** Разрезы списком: название и чем разрез полезен. */
const dimLines = (dims: Dimension[]): string[] =>
  dims.map((d) => (d.note ? `${LI}${d.name}${SEP}${d.note}` : `${LI}${d.name}`))

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
  L.push(node.mid != null ? `${node.name}  ${t('№{n}', { n: String(node.mid).padStart(4, '0') })}` : node.name)
  const place = isTree ? t('дерево «{name}»', { name: node.section }) : t('карта «{name}»', { name: node.section })
  L.push(t('Атлас метрик JetMetrics · {place}', { place }) + (node.group ? t(' · зона «{zone}»', { zone: node.group }) : ''))
  L.push('')

  // ── Служебное: роль, единица, суть, другие имена ──
  L.push(t('Роль: {role}', { role: roleStyle(node.role).label }))
  if (node.units) L.push(t('Единица: {unit}', { unit: t(node.units) }))
  if (node.label) L.push(t('Разрез: {label}', { label: node.label }))
  const essence = c['Суть']
  if (essence) {
    const note = c['Суть · пояснение']
    // в английском пояснение — в скобках: после «Direction: Higher is better» второе двоеточие не читается
    const tail = note ? (LANG === 'en' ? ` (${note})` : ` — ${note}`) : ''
    L.push(t('Суть: {value}', { value: `${t(essence)}${tail}` }))
  }
  if (c['Синонимы']) L.push(t('Она же: {names}', { names: plain(c['Синонимы']) }))
  if (c['EN']) L.push(`EN: ${plain(c['EN'])}`)
  L.push('')

  // ── Содержание карточки. Порядок тот же, что на вкладках: сначала суть,
  //    потом расчёт, потом границы применения. ──
  L.push(...block(t('ОПИСАНИЕ'), plain(c['Описание'] || node.description)))
  L.push(...block(t('ФОРМУЛА'), plain(c['Формула'] || node.formula)))
  L.push(...block(t('НЮАНСЫ РАСЧЁТА'), bullets(c['Нюансы расчёта']).map((s) => `${LI}${s}`).join('\n')))
  L.push(...block(t('ПРИМЕР РАСЧЁТА'), plain(c['Пример расчёта'])))
  L.push(...block(t('ВАЖНОСТЬ'), plain(c['Важность'])))
  // Поле есть не у всех метрик (786 из 950) — пустой заголовок не выводим.
  L.push(...block(t('КОГДА НЕ НУЖНА'), plain(c['Когда не нужна'])))
  L.push(...block(t('РАЗРЕЗЫ'), dimLines(c['Разрезы'] ?? []).join('\n')))
  L.push(...block(isTree ? t('СВЯЗИ В ДЕРЕВЕ') : t('СВЯЗИ НА КАРТЕ'), edgeLines(node).join('\n')))

  // ── Хвост: куда вернуться за первоисточником ──
  const tree = treeOfMetric(node)
  if (tree) L.push(t('Разбирается деревом «{name}».', { name: tree.name }))
  const url = metricUrl(node.section, node.id)
  L.push(t('Источник: Атлас метрик JetMetrics · {url}', { url: url.startsWith('http') ? url : window.location.origin + url }))

  return L.join('\n')
}
