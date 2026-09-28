import { useId, useState } from 'react'
import './Tabs.css'

// Controlled when activeId + onChange are given; otherwise manages its own state.
export default function Tabs({ tabs, activeId, onChange, defaultActiveId, className = '' }) {
  const [internalActive, setInternalActive] = useState(defaultActiveId ?? tabs[0]?.id)
  const isControlled = activeId !== undefined
  const current = isControlled ? activeId : internalActive
  const baseId = useId()

  function select(id) {
    if (!isControlled) setInternalActive(id)
    onChange?.(id)
  }

  function handleKeyDown(event, index) {
    const enabled = tabs.filter((tab) => !tab.disabled)
    if (enabled.length === 0) return
    const currentIndex = enabled.findIndex((tab) => tab.id === tabs[index].id)
    let nextIndex = null
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % enabled.length
    else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + enabled.length) % enabled.length
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = enabled.length - 1
    if (nextIndex !== null) {
      event.preventDefault()
      const next = enabled[nextIndex]
      select(next.id)
      document.getElementById(`${baseId}-tab-${next.id}`)?.focus()
    }
  }

  return (
    <div
      className={['fs-tabs', className].filter(Boolean).join(' ')}
      role="tablist"
      aria-orientation="horizontal"
    >
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          id={`${baseId}-tab-${tab.id}`}
          type="button"
          role="tab"
          aria-selected={current === tab.id}
          aria-controls={`${baseId}-panel-${tab.id}`}
          tabIndex={current === tab.id ? 0 : -1}
          disabled={tab.disabled}
          className={['fs-tabs__tab', current === tab.id ? 'fs-tabs__tab--active' : ''].filter(Boolean).join(' ')}
          onClick={() => select(tab.id)}
          onKeyDown={(event) => handleKeyDown(event, index)}
        >
          {tab.icon ? <span className="fs-tabs__icon">{tab.icon}</span> : null}
          {tab.label}
        </button>
      ))}
    </div>
  )
}
