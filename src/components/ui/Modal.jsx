import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import Button from './Button.jsx'
import Icon from './Icon.jsx'
import './Modal.css'

const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'

export default function Modal({ open, onClose, title, description, footer, size = 'md', children }) {
  const panelRef = useRef(null)
  const previouslyFocused = useRef(null)

  useEffect(() => {
    if (!open) return undefined

    previouslyFocused.current = document.activeElement
    const panel = panelRef.current
    panel?.querySelector(FOCUSABLE)?.focus()

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        onClose?.()
        return
      }
      if (event.key !== 'Tab' || !panel) return
      const focusable = panel.querySelectorAll(FOCUSABLE)
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      previouslyFocused.current?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fs-modal__overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}>
      <div
        className={`fs-modal__panel fs-modal__panel--${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'fs-modal-title' : undefined}
        ref={panelRef}
      >
        <div className="fs-modal__header">
          <div>
            {title ? (
              <h2 className="fs-modal__title" id="fs-modal-title">
                {title}
              </h2>
            ) : null}
            {description ? <p className="fs-modal__description">{description}</p> : null}
          </div>
          <Button variant="ghost" size="sm" iconOnly icon={<Icon name="x" size={16} />} onClick={onClose} aria-label="Close dialog" />
        </div>
        <div className="fs-modal__body">{children}</div>
        {footer ? <div className="fs-modal__footer">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  )
}
