import { cloneElement, useId, useState } from 'react'
import './Tooltip.css'

// Wraps a single focusable child and shows a small label on hover/focus.
export default function Tooltip({ content, position = 'bottom', children }) {
  const [visible, setVisible] = useState(false)
  const id = useId()

  if (!content) return children

  const show = () => setVisible(true)
  const hide = () => setVisible(false)

  return (
    <span className="fs-tooltip" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {cloneElement(children, { 'aria-describedby': visible ? id : undefined })}
      <span role="tooltip" id={id} className={`fs-tooltip__bubble fs-tooltip__bubble--${position} ${visible ? 'fs-tooltip__bubble--visible' : ''}`}>
        {content}
      </span>
    </span>
  )
}
