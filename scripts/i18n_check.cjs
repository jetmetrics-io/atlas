// Проверка английского интерфейса (Map Library): node scripts/i18n_check.cjs
//
// 1. Кириллица в строках живого интерфейса, не обёрнутая в t() / rich() / plural().
//    Живые файлы — всё, что импортируется из src/main.tsx. Дашборды (src/dash/)
//    не переводятся: в английской сборке их нет. Ключи объектов и обращения по ключу
//    (c['Описание']) — коды данных, их не считаем. Остальные намеренные исключения —
//    в ALLOW, у каждого причина.
// 2. Ключи t() / rich(), которых нет в словаре src/i18n/en.ts, и расхождение
//    подстановок {name} и тегов <b> между ключом и переводом.
//
// Код выхода 1, если нашлось что-то вне ALLOW или ключ без перевода.
const fs = require('fs')
const path = require('path')
const ROOT = path.join(__dirname, '..')
const ts = require(path.join(ROOT, 'node_modules/typescript'))

const CYR = /[А-Яа-яЁё]/
const WRAP = new Set(['t', 'rich', 'plural'])
const SKIP_DIRS = ['src/dash/']
const SKIP_FILES = ['src/i18n.ts', 'src/i18n/en.ts']

// [файл (подстрока пути или '*'), строка (регэксп), почему остаётся русской]
const ALLOW = [
  ['*', /^е$/, 'поиск: «ё» приравнивается к «е»'],
  ['src/map/MetricNode.tsx', /^Деньги$/, 'код единицы из данных (сравнение)'],
  ['src/site/Reference.tsx', /^(Количество|Деньги|Время)$/, 'коды единиц из данных (значения фильтра)'],
  ['src/tree/tree.ts', /^(ЕСЛИ |ОБЩЕЕ ДЛЯ ВСЕХ)/, 'коды групп моделей бизнеса из данных'],
  ['src/site/analytics.ts', /./, 'подписи событий для отчёта Метрики, на экран не выходят'],
  ['src/map/NodeCard.tsx', /^Справочник$/, 'раздел в событии аналитики, на экран не выходит'],
  ['src/site/nav.ts', /джетметрикс\.рф/, 'адрес русского сайта, русская ветка'],
  ['src/tree/TreeView.tsx', /^НАРУШЕНИЯ РАСКЛАДКИ/, 'самопроверка раскладки, для разработчика'],
  ['src/tree/layout.ts', /./, 'самопроверка раскладки, для разработчика'],
  ['src/map/MapView.tsx', /^(Дашборды по этой карте|Собираю лист)$/, 'дашборды, в английской сборке скрыты'],
]

function liveFiles() {
  const seen = new Set()
  const walk = (rel) => {
    if (seen.has(rel)) return
    seen.add(rel)
    const text = fs.readFileSync(path.join(ROOT, rel), 'utf8')
    const re = /(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]/g
    for (const m of text.matchAll(re)) {
      const spec = m[1] || m[2] || m[3]
      if (!spec.startsWith('.')) continue
      const base = path.posix.join(path.posix.dirname(rel), spec)
      const hit = ['', '.ts', '.tsx', '/index.ts', '/index.tsx'].map((e) => base + e)
        .find((p) => /\.tsx?$/.test(p) && fs.existsSync(path.join(ROOT, p)))
      if (hit) walk(hit)
    }
  }
  walk('src/main.tsx')
  return [...seen].filter((f) => !SKIP_FILES.includes(f) && !SKIP_DIRS.some((d) => f.startsWith(d))).sort()
}

function loadDict() {
  const src = fs.readFileSync(path.join(ROOT, 'src/i18n/en.ts'), 'utf8')
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  const m = { exports: {} }
  new Function('module', 'exports', js)(m, m.exports)
  return m.exports.EN
}

const EN = loadDict()
const keys = new Map()
const bad = []
const allowed = []

for (const f of liveFiles()) {
  const src = ts.createSourceFile(f, fs.readFileSync(path.join(ROOT, f), 'utf8'), ts.ScriptTarget.Latest, true,
    f.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const line = (n) => src.getLineAndCharacterOfPosition(n.getStart()).line + 1
  const wrapped = (n) => {
    for (let c = n, p = n.parent; p; c = p, p = p.parent) {
      if (ts.isCallExpression(p) && ts.isIdentifier(p.expression) && WRAP.has(p.expression.text)
        && p.arguments.includes(c)) return true
      if (!ts.isArrayLiteralExpression(p)) return false      // plural(n, ['…'], […])
    }
    return false
  }
  const isKey = (n) => {
    const p = n.parent
    return ((ts.isPropertyAssignment(p) || ts.isPropertySignature(p)) && p.name === n)
      || (ts.isElementAccessExpression(p) && p.argumentExpression === n)
  }
  const visit = (n) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && (n.expression.text === 't' || n.expression.text === 'rich')) {
      const a = n.arguments[0]
      if (a && (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a))) {
        if (!keys.has(a.text)) keys.set(a.text, `${f}:${line(a)}`)
      }
    }
    let text = null
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) text = n.text
    else if (ts.isTemplateExpression(n)) text = [n.head.text, ...n.templateSpans.map((s) => s.literal.text)].join('${…}')
    else if (ts.isJsxText(n)) text = n.text.trim()
    if (text && CYR.test(text) && !isKey(n) && (ts.isJsxText(n) || !wrapped(n))) {
      const rule = ALLOW.find(([file, re]) => (file === '*' || f === file) && re.test(text))
      ;(rule ? allowed : bad).push({ at: `${f}:${line(n)}`, text, why: rule?.[2] })
    }
    if (ts.isTemplateExpression(n)) n.templateSpans.forEach((s) => visit(s.expression))
    else ts.forEachChild(n, visit)
  }
  visit(src)
}

const marks = (s) => [...s.matchAll(/\{(\w+)\}|<(\w+)>/g)].map((m) => m[0]).sort().join(',')
const missing = [...keys].filter(([k]) => !(k in EN))
const mismatch = [...keys].filter(([k]) => k in EN && marks(k) !== marks(EN[k]))

console.log(`Оставлено русским намеренно: ${allowed.length}`)
for (const a of allowed) console.log(`  ${a.at}  ${JSON.stringify(a.text).slice(0, 70)}  — ${a.why}`)
console.log(`\nНе обёрнуто: ${bad.length}`)
for (const b of bad) console.log(`  ${b.at}  ${JSON.stringify(b.text).slice(0, 100)}`)
console.log(`\nКлючей t()/rich(): ${keys.size}, без перевода: ${missing.length}, с расхождением подстановок: ${mismatch.length}`)
for (const [k, at] of missing) console.log(`  нет перевода  ${at}  ${JSON.stringify(k)}`)
for (const [k, at] of mismatch) console.log(`  подстановки   ${at}  ${JSON.stringify(k)} → ${JSON.stringify(EN[k])}`)
process.exit(bad.length || missing.length || mismatch.length ? 1 : 0)
