import './EmptyState.css'

export default function EmptyState({ icon, title, description, action, badge }) {
  return (
    <div className="fs-empty">
      {icon ? <div className="fs-empty__icon">{icon}</div> : null}
      {badge ? <div className="fs-empty__badge">{badge}</div> : null}
      {title ? <h2 className="fs-empty__title">{title}</h2> : null}
      {description ? <p className="fs-empty__description">{description}</p> : null}
      {action ? <div className="fs-empty__action">{action}</div> : null}
    </div>
  )
}
