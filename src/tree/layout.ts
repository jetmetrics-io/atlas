// Раскладка дерева драйверов: три ступени от фокуса — ключевая метрика,
// компоненты, драйверы. Поток справа налево, координаты внутренние (от нуля),
// снаружи дерево ставится левым верхним углом.
//
// Правила геометрии — design/map_layout_rules.md § 9: константы колонок, родитель
// центрируется по детям, канал пучка на midX, пучок = знак, лесенка портов,
// мёртвая зона порта 8–20 px, R = 10 на всех углах. Раскладку тут переделывали
// трижды «на глаз» — читать свод ДО правки.
//
// Функция чистая: на вход ступень, на выходе координаты и пути. Ни DOM, ни React.

export interface TreeKid {
  name: string
  role: string
  units: string
  sign: string
  group?: string
  total?: number
}

export interface TreeComp extends TreeKid {
  kids: TreeKid[]
  /** карточка выбора модели бизнеса вместо метрик ветки */
  pick?: { axis: string; value: string; label: string; count: number }
}

export interface TreeSpec {
  name: string
  role: string
  units: string
  key?: boolean
  comps: TreeComp[]
}

export interface PlacedNode {
  name: string
  role: string
  units: string
  /** модель бизнеса, к которой относится метрика: по ней ветки группируются */
  group?: string
  tier: 0 | 1 | 2
  parent: string
  x: number
  y: number
  w: number
  h: number
  isKey: boolean
  total?: number
  pick?: TreeComp['pick']
}

export interface PlacedWire { d: string; color: string; marker?: string }

export interface TreeLayout {
  nodes: PlacedNode[]
  wires: PlacedWire[]
  markers: { id: string; color: string }[]
  /** чип «+ N» у драйвера: якорь и число метрик под ним */
  chips: { name: string; x: number; cy: number; total: number }[]
  w: number
  h: number
  keyCY: number
  cols: [number, number, number]
  tiers: 2 | 3
  /** нарушения правил геометрии — сдавать только с пустым списком */
  audit: string[]
}

// габариты и зазоры — design/map_layout_rules.md § 9
const W = 255, H = 96, KEY_H = 118, ROW = 12, GROUP = 46, GAP = 82, DOCK = 12
const HEAD = 48, STUB = 14, CHIP = 50
const R = 10, ALIGN = 8, PORT_GAP = 26, PORT_MARGIN = 22, CHAN_GAP = 26
export const TREE_GAP = 150, TREE_TAIL = 210
export const NODE_W = W, NODE_H = H, TREE_HEAD = HEAD, CORNER = R

const GREEN = '#0E9C7D', CORAL = '#FF5C60'

/** Ломаная со скруглёнными углами. Скругляются только внутренние точки одной
 *  ломаной, поэтому связь ведётся ОДНИМ путём до самой грани карточки. */
export function roundPoly(pts: [number, number][], r = R): string {
  let d = `M ${pts[0][0]},${pts[0][1]}`
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i - 1], c = pts[i], n = pts[i + 1]
    const l1 = Math.hypot(c[0] - p[0], c[1] - p[1]) || 1
    const l2 = Math.hypot(n[0] - c[0], n[1] - c[1]) || 1
    const rr = Math.min(r, l1 / 2, l2 / 2)
    d += ` L ${c[0] - ((c[0] - p[0]) / l1) * rr},${c[1] - ((c[1] - p[1]) / l1) * rr}` +
      ` Q ${c[0]},${c[1]} ${c[0] + ((n[0] - c[0]) / l2) * rr},${c[1] + ((n[1] - c[1]) / l2) * rr}`
  }
  return d + ` L ${pts[pts.length - 1][0]},${pts[pts.length - 1][1]}`
}

interface WireKid { sign: string; sy: number }

/** Пучок связей от детей к родителю: дети одного знака идут одним каналом,
 *  входят в родителя лесенкой портов. */
function wire(
  kids: WireKid[], sxCol: number, txCol: number, ty: number, th: number,
  idp: string, audit: string[],
): { wires: PlacedWire[]; markers: { id: string; color: string }[] } {
  const midX = (sxCol + txCol) / 2
  const corr: [number, number] = [Math.min(sxCol, txCol), Math.max(sxCol, txCol)]

  const bundles: { sign: string; kids: WireKid[]; far: number }[] = []
  kids.forEach((k) => {
    let b = bundles.find((x) => x.sign === k.sign)
    if (!b) bundles.push(b = { sign: k.sign, kids: [], far: 0 })
    b.kids.push(k)
  })
  bundles.forEach((b) => { b.far = b.kids.reduce((a, k) => a + k.sy, 0) / b.kids.length })
  bundles.sort((a, b) => a.far - b.far)

  const n = bundles.length, half = th / 2 - PORT_MARGIN
  const off = bundles.map((_, i) => (i - (n - 1) / 2) * PORT_GAP)

  // Сдвиг лесенки портов: порт нельзя ставить в 8–20 px от связи, перемычка выйдет
  // короче 2R и угол ужмётся. Перебираем сдвиги, берём без коротких перемычек.
  const cand = [0]
  bundles.forEach((b, i) => b.kids.forEach((k) => cand.push(k.sy - ty - off[i])))
  let best: { s: number; sc: number[] } | null = null
  cand.forEach((s) => {
    if (!off.every((o) => Math.abs(o + s) <= half + 0.01)) return
    let bad = 0, straight = 0
    bundles.forEach((b, i) => b.kids.forEach((k) => {
      const d = Math.abs(k.sy - ty - off[i] - s)
      // «почти прямая» — тоже брак: связь уйдёт мимо порта на пару пикселей
      // и встанет рядом со второй связью пучка двойной линией.
      if (d < 0.01) straight++
      else if (d < 2 * R) bad++
    }))
    const sc = [bad, -straight, Math.abs(s)]
    if (!best || sc[0] < best.sc[0] || (sc[0] === best.sc[0] &&
      (sc[1] < best.sc[1] || (sc[1] === best.sc[1] && sc[2] < best.sc[2])))) best = { s, sc }
  })
  const shift = best ? (best as { s: number }).s : 0
  const etys = bundles.map((_, i) => ty + Math.max(-half, Math.min(half, off[i] + shift)))

  // Канал пучка. По умолчанию все идут по midX — тогда у ключевой метрики с двумя
  // пучками (доходы сверху, расходы снизу) получается ровная скобка. Разводим по
  // своим каналам ТОЛЬКО когда вертикали пучков перекрываются по Y: иначе зелёная
  // и коралловая легли бы на одну ось и слились бы в линию, меняющую цвет.
  const span = bundles.map((b, i) => {
    let lo = etys[i], hi = etys[i]
    b.kids.forEach((k) => { lo = Math.min(lo, k.sy); hi = Math.max(hi, k.sy) })
    return [lo, hi]
  })
  let cross = false
  for (let a = 0; a < n; a++) for (let c = a + 1; c < n; c++)
    if (span[a][1] > span[c][0] - 2 * R && span[c][1] > span[a][0] - 2 * R) cross = true
  const chan = bundles.map((_, i) => (cross ? midX + ((n - 1) / 2 - i) * CHAN_GAP : midX))

  const wires: PlacedWire[] = []
  const markers: { id: string; color: string }[] = []
  bundles.forEach((b, i) => {
    const ety = etys[i]
    const col = b.sign === '+' ? GREEN : CORAL
    const id = idp + i
    markers.push({ id, color: col })
    b.kids.forEach((k, ki) => {
      const last = ki === b.kids.length - 1
      const d = Math.abs(k.sy - ety)
      const pts: [number, number][] = d <= ALIGN
        ? [[sxCol + DOCK, k.sy], [txCol, k.sy]]
        : [[sxCol + DOCK, k.sy], [chan[i], k.sy], [chan[i], ety], [txCol, ety]]
      if (d > 0.01 && d <= ALIGN && b.kids.length > 1)
        audit.push(`${idp}${ki}: прямая мимо порта на ${d.toFixed(1)} px — ` +
          'рядом придёт вторая связь пучка, будет двойная линия')
      wires.push({ d: roundPoly(pts), color: col, marker: last ? id : undefined })
      guard(pts, txCol, chan[i], corr, idp + ki, audit)
    })
  })
  return { wires, markers }
}

/** Самопроверка геометрии — правило 9 свода раскладки. */
function guard(
  pts: [number, number][], txCol: number, chan: number,
  corr: [number, number], tag: string, audit: string[],
) {
  if (chan < corr[0] + 2 * R || chan > corr[1] - 2 * R)
    audit.push(`${tag}: канал ${chan} ближе 2R к колонке, угол ужмётся`)
  if (pts[pts.length - 1][0] !== txCol) audit.push(`${tag}: путь не доходит до грани`)
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i]
    if (a[0] !== b[0] && a[1] !== b[1]) audit.push(`${tag}: диагональ`)
    if (pts.length > 2 && Math.hypot(b[0] - a[0], b[1] - a[1]) < 2 * R)
      audit.push(`${tag}: отрезок ${i} короче 2R, угол скруглится мельче остальных`)
  }
}

/**
 * Раскладка одной ступени.
 * @param keyExtra добавка к высоте ключевой карточки под переключатель моделей
 * @param topKey ключевую прижать к верху — так раскладывается дерево, открытое
 *   провалом: оно бывает выше экрана, и центрированная по детям ключевая уезжает
 *   из виду ровно у той метрики, в которую только что провалились.
 */
export function layoutTree(spec: TreeSpec, idp: string, topKey = false,
                           keyExtra = 0): TreeLayout {
  const groups = spec.comps.map((c) => {
    const n = Math.max(1, c.kids.length)
    return { c, h: n * H + (n - 1) * ROW }
  })
  const treeH = groups.reduce((a, g) => a + g.h, 0) + GROUP * (groups.length - 1)
  const colR = 0, colC = colR + W + GAP, colD = colC + W + GAP
  const hasDrivers = groups.some((g) => g.c.kids.length > 0)
  const wide = hasDrivers ? colD + W + STUB + CHIP : colC + W

  const nodes: PlacedNode[] = []
  const chips: TreeLayout['chips'] = []
  const audit: string[] = []
  const wires: PlacedWire[] = []
  const markers: { id: string; color: string }[] = []

  let y = HEAD
  const mid: { c: TreeComp; cy: number; gTop: number; ci: number }[] = []
  groups.forEach((g, ci) => {
    const gTop = y
    g.c.kids.forEach((k, i) => {
      const ky = gTop + i * (H + ROW)
      nodes.push({ name: k.name, role: k.role, units: k.units, tier: 2, group: k.group,
                   parent: g.c.name, x: colD, y: ky, w: W, h: H, isKey: false, total: k.total })
      if (k.total) chips.push({ name: k.name, x: colD + W, cy: ky + H / 2, total: k.total })
    })
    // в детальном дереве компонент прижат к верху своей группы, а не к центру:
    // верхний драйвер тогда встаёт с ним в одну линию, ступень читается сверху вниз
    const cy = topKey ? gTop : gTop + g.h / 2 - H / 2
    nodes.push({ name: g.c.name, role: g.c.role, units: g.c.units, tier: 1, group: g.c.group,
                 parent: spec.name, x: colC, y: cy, w: W, h: H, isKey: false, pick: g.c.pick })
    mid.push({ c: g.c, cy: cy + H / 2, gTop, ci })
    y = gTop + g.h + GROUP
  })

  // Корень обзорного дерева крупнее и центрирован по своим детям; корень детального
  // ростом с обычную карточку — он встаёт напротив драйвера, из которого провалились.
  // keyExtra — место под переключатель моделей бизнеса: он живёт на карточке
  // ключевой метрики, потому что разбирает именно её.
  const kh = (topKey ? H : KEY_H) + keyExtra
  const rootY = topKey ? HEAD : (mid[0].cy + mid[mid.length - 1].cy) / 2 - kh / 2
  nodes.push({ name: spec.name, role: spec.role, units: spec.units, tier: 0,
               parent: '', x: colR, y: rootY, w: W, h: kh, isKey: !topKey })

  mid.forEach((g) => {
    if (!g.c.kids.length) return
    const w = wire(
      g.c.kids.map((k, i) => ({ sign: k.sign, sy: g.gTop + i * (H + ROW) + H / 2 })),
      colD, colC + W, g.cy, H, `${idp}m${g.ci}_`, audit,
    )
    wires.push(...w.wires); markers.push(...w.markers)
  })
  const w0 = wire(mid.map((g) => ({ sign: g.c.sign, sy: g.cy })),
                  colC, colR + W, rootY + kh / 2, kh, `${idp}r`, audit)
  wires.push(...w0.wires); markers.push(...w0.markers)

  return {
    nodes, wires, markers, chips,
    w: wide, h: HEAD + Math.max(treeH, topKey ? kh : 0) + 10,
    keyCY: rootY + kh / 2, cols: [colR, colC, colD],
    tiers: hasDrivers ? 3 : 2, audit,
  }
}
