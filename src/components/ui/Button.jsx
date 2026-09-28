import './Button.css'

const VARIANT_CLASS = {
  primary: 'fs-btn--primary',
  secondary: 'fs-btn--secondary',
  outline: 'fs-btn--outline',
  ghost: 'fs-btn--ghost',
  danger: 'fs-btn--danger',
}

const SIZE_CLASS = {
  sm: 'fs-btn--sm',
  md: 'fs-btn--md',
  lg: 'fs-btn--lg',
}

export default function Button({
  variant = 'secondary',
  size = 'md',
  icon = null,
  iconPosition = 'left',
  iconOnly = false,
  fullWidth = false,
  disabled = false,
  type = 'button',
  className = '',
  children,
  ...rest
}) {
  const classes = [
    'fs-btn',
    VARIANT_CLASS[variant] ?? VARIANT_CLASS.secondary,
    SIZE_CLASS[size] ?? SIZE_CLASS.md,
    fullWidth ? 'fs-btn--full' : '',
    iconOnly ? 'fs-btn--icon-only' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button type={type} className={classes} disabled={disabled} {...rest}>
      {icon && iconPosition === 'left' ? <span className="fs-btn__icon">{icon}</span> : null}
      {!iconOnly && children ? <span className="fs-btn__label">{children}</span> : null}
      {iconOnly && !children ? <span className="fs-btn__icon">{icon}</span> : null}
      {icon && iconPosition === 'right' && !iconOnly ? <span className="fs-btn__icon">{icon}</span> : null}
    </button>
  )
}
