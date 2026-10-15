// Map Library inside JetMetrics Workspace (the English build on jetmetrics.io): where the screen is.
// The host page grows the iframe to the app's height (jm-atlas-height), so inside the app 100vh and
// "the middle of the window" mean the middle of the whole tall iframe, not of what the person sees.
// The host page tells where the visible part is:
//   parent → iframe  { type: 'jm-atlas-view', top, vh }   top — the iframe's top edge, vh — the height of the
//                                                          visible part of the window; both below the site's
//                                                          fixed header (the header covers the rest)
//   iframe → parent  { type: 'jm-atlas-want-view' }        ask for it now (on start and when a window opens)
// What uses it:
//   - the map and the tree take exactly the visible height (--jm-host-vh, index.css): the iframe follows them,
//     and the legend, minimap and zoom stay on screen instead of under the header or below the window;
//   - the "Available in the full version" window stands in the middle of the visible part (LockDialog.tsx).
// The dictionary card reads the same message itself (Reference.tsx). The Russian build has no Workspace:
// WORKSPACE is false there and nothing here runs.
import { useEffect, useState } from 'react'
import { WORKSPACE } from './workspace'

export type HostView = { top: number; vh: number }

let view: HostView | null = null
const subs = new Set<() => void>()

/** Ask the host page for the current position of the screen (the answer comes as jm-atlas-view). */
export function askHostView() {
  if (!WORKSPACE) return
  try { window.parent.postMessage({ type: 'jm-atlas-want-view' }, '*') } catch { /* no parent */ }
}

if (WORKSPACE && typeof window !== 'undefined') {
  document.documentElement.classList.add('jm-ws')
  window.addEventListener('message', (e) => {
    if (e.source !== window.parent) return
    const d = e.data as { type?: string; top?: unknown; vh?: unknown } | null
    if (!d || d.type !== 'jm-atlas-view' || typeof d.top !== 'number' || typeof d.vh !== 'number' || d.vh <= 0) return
    const changed = !view || view.vh !== d.vh
    view = { top: d.top, vh: d.vh }
    if (changed) document.documentElement.style.setProperty('--jm-host-vh', Math.round(d.vh) + 'px')
    subs.forEach((f) => f())
  })
  askHostView()
}

/** The visible part of the iframe in its own coordinates (null — the host page hasn't told yet). */
export function visibleRange(): { y0: number; y1: number } | null {
  if (!view) return null
  const y0 = Math.max(0, -view.top)
  const y1 = Math.min(window.innerHeight, view.vh - view.top)
  return y1 > y0 ? { y0, y1 } : null
}

/** Re-render on every new position of the screen; returns the visible part (see visibleRange). */
export function useHostView(on = true): { y0: number; y1: number } | null {
  const [, bump] = useState(0)
  useEffect(() => {
    if (!WORKSPACE || !on) return
    const f = () => bump((x) => x + 1)
    subs.add(f)
    askHostView()
    return () => { subs.delete(f) }
  }, [on])
  return WORKSPACE && on ? visibleRange() : null
}
