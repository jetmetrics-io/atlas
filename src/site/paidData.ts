// Map Library inside JetMetrics Workspace (the English build on jetmetrics.io): paid maps.
// The paid data (data/*_full.json) comes only from the site's sign-in server, after it checks the person's pass,
// and never from the Russian list of buyers. The pass and the server's address come from the host page
// (/workspace-map-library):
//   iframe → parent  { type: 'jm-ws-hello' }                  on start (workspace.ts)
//   parent → iframe  { type: 'jm-ws-access', pass, api }      the person's pass ('' — not signed in) and the server
// The server answers <api>/api/workspace/me with the paid areas ("map-library") and serves the files at
// <api>/api/workspace/map-library/data/<file>. The Russian build has no Workspace: nothing here runs there.
import { WORKSPACE } from './workspace'

let access: { pass: string; api: string } | null = null
let arrivedResolve: () => void = () => {}
const arrived = new Promise<void>((res) => { arrivedResolve = res })

if (WORKSPACE && typeof window !== 'undefined') {
  window.addEventListener('message', (e) => {
    const d = e.data as { type?: string; pass?: unknown; api?: unknown } | null
    if (d && d.type === 'jm-ws-access') {
      access = typeof d.pass === 'string' && d.pass ? { pass: d.pass, api: String(d.api ?? '') } : null
      arrivedResolve()
    }
  })
}

/** Where the paid files come from and how to ask for them (set by workspacePaid). */
export let paidRoot = './'
export let paidInit: RequestInit | undefined

/** Has the person bought Map Library: the pass from the host page, the purchases from the server. */
export async function workspacePaid(): Promise<boolean> {
  if (!WORKSPACE) return false
  await Promise.race([arrived, new Promise((r) => setTimeout(r, 3000))])
  if (!access) return false
  const headers = { 'X-JM-Pass': access.pass }
  const me = await fetch(access.api + '/api/workspace/me', { headers, cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null)).catch(() => null) as { paid?: string[] } | null
  if (!me || !Array.isArray(me.paid) || !me.paid.includes('map-library')) return false
  paidRoot = access.api + '/api/workspace/map-library/'
  paidInit = { headers, cache: 'no-store' }
  return true
}
