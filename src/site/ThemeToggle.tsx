import { useState } from 'react'

// Переключатель светлой/тёмной темы. Шапки в приложении больше нет (единая шапка —
// на Тильде), поэтому кнопка живёт прямо на холсте (каталог/карта).
export function ThemeToggle({ className = '' }: { className?: string }) {
  const [dark, setDark] = useState(
    () => typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark',
  )
  const toggle = () => {
    const next = dark ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', next)
    try { localStorage.setItem('jm-theme', next) } catch (e) { /* приватный режим */ }
    setDark(!dark)
  }
  return (
    <button
      className={`themetoggle${className ? ' ' + className : ''}`} onClick={toggle}
      title={dark ? 'Светлая тема' : 'Тёмная тема'}
      aria-label={dark ? 'Включить светлую тему' : 'Включить тёмную тему'}
    >
      {dark ? (
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 13.5A8 8 0 1 1 10.5 4a6.3 6.3 0 0 0 9.5 9.5Z" />
        </svg>
      )}
    </button>
  )
}
