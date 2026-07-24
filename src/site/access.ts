// Гейт полной версии Атласа: кто залогинен (email) и оплатил ли он.
//
// Атлас встроен в Тильду iframe'ом с ДРУГОГО origin (storage.yandexcloud.net), поэтому
// изнутри iframe НЕ виден ни `parent.window.mauser` (SOP), ни куки Тильды. Email
// добываем слоями, от дешёвого к надёжному:
//   1. ?email= в URL         — обёртка может подставить (и удобно для теста).
//   2. window.mauser.email   — сработает, только если Атлас открыт как ВЕРХНЯЯ страница
//                              (тот же origin), не в iframe. Оставлен как дешёвый шанс.
//   3. postMessage-хендшейк   — штатный путь для iframe: спрашиваем родителя, он отвечает
//                              email залогиненного (см. протокол ниже). Обёртку на Тильде
//                              заводит команда сайта (задача в HANDOFF).
//
// Протокол с родительской страницей Тильды:
//   iframe → parent:  { jmAtlasReady: 1 }              (повторяем, пока не ответят)
//   parent → iframe:  { jmAtlasEmail: mauser.email }   (в ответ и/или когда mauser готов)
//
// Надёжность — СРЕДНЯЯ (клиентская): подкованный человек подменит email в консоли или
// ответ paid.json. От обычного пользователя закрывает. Железный уровень (сервер проверяет
// подписанный mauser.token) — отдельная задача, не здесь.

const PAID_URL = 'https://jetmetrics-static.storage.yandexcloud.net/payment/paid.json'
// Ручной список мест командного тарифа (4 коллеги на аккаунт) — заводит команда сайта.
const ALLOW_URL = 'https://jetmetrics-static.storage.yandexcloud.net/payment/allowlist.json'

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase()

/** Email залогиненного пользователя (или '' если аноним/не добыли за таймаут). */
export function resolveEmail(): Promise<string> {
  // 1. ?email=
  try {
    const q = new URLSearchParams(window.location.search).get('email')
    if (q) return Promise.resolve(norm(q))
  } catch { /* нет window/URL — ниже */ }

  // 2. window.mauser (доступен только вне iframe, тот же origin)
  const m = (window as unknown as { mauser?: { email?: string } }).mauser?.email
  if (m) return Promise.resolve(norm(m))

  // Не встроены в iframe → спрашивать некого, сразу аноним (без 4-сек ожидания).
  if (window.parent === window.self) return Promise.resolve('')

  // 3. postMessage-хендшейк с родителем
  return new Promise((resolve) => {
    let done = false
    const finish = (v: string) => { if (!done) { done = true; cleanup(); resolve(v) } }

    const onMsg = (e: MessageEvent) => {
      const d = e.data
      if (d && typeof d === 'object' && 'jmAtlasEmail' in d) {
        finish(norm((d as { jmAtlasEmail?: unknown }).jmAtlasEmail))
      }
    }
    const ask = () => { try { window.parent.postMessage({ jmAtlasReady: 1 }, '*') } catch { /* нет родителя */ } }
    const cleanup = () => {
      window.removeEventListener('message', onMsg)
      window.clearInterval(ping)
      window.clearTimeout(to)
    }

    window.addEventListener('message', onMsg)
    ask()                                   // спросить сразу
    const ping = window.setInterval(ask, 400) // и повторять (родительский слушатель мог не успеть)
    const to = window.setTimeout(() => finish(''), 4000) // не ответили → аноним, показываем free
  })
}

const fetchList = async (url: string, pick: (d: unknown) => unknown[]): Promise<string[]> => {
  try {
    const r = await fetch(url, { cache: 'no-store' })
    if (!r.ok) return []
    return pick(await r.json()).map(norm).filter(Boolean)
  } catch {
    return []
  }
}

/** Оплатил ли этот email (есть в paid.json.buyers ∪ allowlist.json.emails). */
export async function isPaid(email: string): Promise<boolean> {
  const e = norm(email)
  if (!e) return false
  const [buyers, allow] = await Promise.all([
    fetchList(PAID_URL, (d) => (d as { buyers?: { email?: string }[] })?.buyers?.map((b) => b?.email ?? '') ?? []),
    fetchList(ALLOW_URL, (d) => (d as { emails?: string[] })?.emails ?? []),
  ])
  return buyers.includes(e) || allow.includes(e)
}
