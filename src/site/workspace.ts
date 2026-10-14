// Map Library inside JetMetrics Workspace (the English build embedded on jetmetrics.io):
// the bookmark that saves a map or a tree to the person's Workspace ("Saved" on the Workspace home).
// The saved list belongs to the host page (it lives in the account there), so the app only talks to it:
//   iframe → parent  { type: 'jm-ws-hello' }            on start
//   iframe → parent  { type: 'jm-ws-save', item }        a click on the bookmark (toggle)
//   parent → iframe  { type: 'jm-ws-saved', keys: [] }   the current saved keys
// The Russian build has no Workspace: WORKSPACE is false there and nothing renders.
import { useEffect, useState } from 'react'
import { LANG } from '../i18n'
import { EMBED } from './nav'

export const WORKSPACE = LANG === 'en' && EMBED

export type SaveItem = { key: string; kind: string; title: string; url: string }

let keys = new Set<string>()
const subs = new Set<() => void>()

if (WORKSPACE && typeof window !== 'undefined') {
  window.addEventListener('message', (e) => {
    const d = e.data as { type?: string; keys?: unknown } | null
    if (d && d.type === 'jm-ws-saved' && Array.isArray(d.keys)) {
      keys = new Set(d.keys.map(String))
      subs.forEach((f) => f())
    }
  })
  try { window.parent.postMessage({ type: 'jm-ws-hello' }, '*') } catch { /* no parent */ }
}

export const itemOfMap = (name: string): SaveItem =>
  ({ key: 'map:' + name, kind: 'Map', title: name, url: '/workspace-map-library?map=' + encodeURIComponent(name) })

export const itemOfTree = (slug: string, name: string): SaveItem =>
  ({ key: 'tree:' + slug, kind: 'Driver tree', title: name, url: '/workspace-map-library?tree=' + encodeURIComponent(slug) })

export function useSaved(key: string): boolean {
  const [, bump] = useState(0)
  useEffect(() => {
    const f = () => bump((x) => x + 1)
    subs.add(f)
    return () => { subs.delete(f) }
  }, [])
  return keys.has(key)
}

export function toggleSave(item: SaveItem) {
  // optimistic: the bookmark fills at once, the host page answers with the real list
  if (keys.has(item.key)) keys.delete(item.key)
  else keys.add(item.key)
  subs.forEach((f) => f())
  try { window.parent.postMessage({ type: 'jm-ws-save', item }, '*') } catch { /* no parent */ }
}
