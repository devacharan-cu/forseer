import './Badge.css'

const VARIANT_CLASS = {
  neutral: 'fs-badge--neutral',
  success: 'fs-badge--success',
  warning: 'fs-badge--warning',
  danger: 'fs-badge--danger',
  info: 'fs-badge--info',
  accent: 'fs-badge--accent',
}

export default function Badge({ variant = 'neutral', dot = false, size = 'md', className = '', children }) {
  return (
    <span
      className={['fs-badge', VARIANT_CLASS[variant] ?? VARIANT_CLASS.neutral, `fs-badge--${size}`, className]
        .filter(Boolean)
        .join(' ')}
    >
      {dot ? <span className="fs-badge__dot" /> : null}
      {children}
    </span>
  )
}
