import './StatusDot.css'

const VARIANT_CLASS = {
  success: 'fs-status-dot--success',
  warning: 'fs-status-dot--warning',
  danger: 'fs-status-dot--danger',
  neutral: 'fs-status-dot--neutral',
}

export default function StatusDot({ variant = 'success', pulse = false, label }) {
  return (
    <span className="fs-status-dot-wrap">
      <span className={['fs-status-dot', VARIANT_CLASS[variant] ?? VARIANT_CLASS.neutral, pulse ? 'fs-status-dot--pulse' : ''].filter(Boolean).join(' ')} />
      {label ? <span className="fs-status-dot__label">{label}</span> : null}
    </span>
  )
}
