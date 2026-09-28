import { useEffect, useRef, useState } from 'react'
import './Dropdown.css'

// Generic menu: a trigger render-prop and a flat list of items.
// items: [{ id, label, icon, onSelect, danger }] — a falsy item renders a divider.
export default function Dropdown({ trigger, items, align = 'start', className = '' }) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const rootRef = useRef(null)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    function handlePointerDown(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setOpen(false)
        rootRef.current?.querySelector('[data-dropdown-trigger]')?.focus()
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const selectable = items.filter(Boolean)

  function toggleOpen() {
    setOpen((value) => !value)
    setActiveIndex(-1)
  }

  function moveActive(step) {
    setActiveIndex((current) => {
      const next = (current + step + selectable.length) % selectable.length
      return next
    })
  }

  function handleMenuKeyDown(event) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      moveActive(1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveActive(-1)
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault()
      selectable[activeIndex]?.onSelect?.()
      setOpen(false)
    }
  }

  useEffect(() => {
    if (activeIndex < 0) return
    // Index into rendered [role="menuitem"] elements only — items may include
    // non-selectable dividers, so activeIndex (which indexes `selectable`) must
    // not be used against all of menuRef's children.
    const node = menuRef.current?.querySelectorAll('[role="menuitem"]')[activeIndex]
    node?.focus()
  }, [activeIndex])

  return (
    <div className={['fs-dropdown', className].filter(Boolean).join(' ')} ref={rootRef}>
      <span data-dropdown-trigger onClick={toggleOpen}>
        {trigger({ open })}
      </span>
      {open ? (
        <div
          className={['fs-dropdown__menu', align === 'end' ? 'fs-dropdown__menu--end' : ''].filter(Boolean).join(' ')}
          role="menu"
          ref={menuRef}
          onKeyDown={handleMenuKeyDown}
        >
          {items.map((item, index) =>
            item ? (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                tabIndex={-1}
                className={['fs-dropdown__item', item.danger ? 'fs-dropdown__item--danger' : ''].filter(Boolean).join(' ')}
                onClick={() => {
                  item.onSelect?.()
                  setOpen(false)
                }}
              >
                {item.icon ? <span className="fs-dropdown__icon">{item.icon}</span> : null}
                <span>{item.label}</span>
              </button>
            ) : (
              <div key={`divider-${index}`} className="fs-dropdown__divider" role="separator" />
            ),
          )}
        </div>
      ) : null}
    </div>
  )
}
