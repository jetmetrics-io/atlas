import { type SaveItem, WORKSPACE, toggleSave, useSaved } from './workspace'
import { t } from '../i18n'
import './savemark.css'

// Bookmark "save to Workspace" (Maria chose the bookmark icon, 08.10.2026): outline — not saved,
// filled — saved. Only in the English build inside Workspace.
export function SaveMark({ item, className }: { item: SaveItem; className?: string }) {
  const on = useSaved(item.key)
  if (!WORKSPACE) return null
  return (
    <button type="button"
      className={'savemark' + (on ? ' is-on' : '') + (className ? ' ' + className : '')}
      aria-pressed={on}
      aria-label={on ? t('Убрать из сохранённого') : t('Сохранить в Workspace')}
      title={on ? t('Сохранено · нажмите, чтобы убрать') : t('Сохранить в Workspace')}
      onClick={(e) => { e.stopPropagation(); toggleSave(item) }}>
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path d="M7 3.5h10a1 1 0 0 1 1 1V21l-6-4-6 4V4.5a1 1 0 0 1 1-1z"
          fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      </svg>
    </button>
  )
}
