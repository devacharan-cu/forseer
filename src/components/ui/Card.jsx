import './Card.css'

export default function Card({ title, description, actions, padding = 'md', className = '', children, ...rest }) {
  const hasHeader = title || description || actions
  return (
    <div className={['fs-card', `fs-card--pad-${padding}`, className].filter(Boolean).join(' ')} {...rest}>
      {hasHeader && (
        <div className="fs-card__header">
          <div className="fs-card__heading">
            {title ? <h3 className="fs-card__title">{title}</h3> : null}
            {description ? <p className="fs-card__description">{description}</p> : null}
          </div>
          {actions ? <div className="fs-card__actions">{actions}</div> : null}
        </div>
      )}
      {children}
    </div>
  )
}
