import './Spinner.css'

export default function Spinner({ size = 18, label = 'Loading' }) {
  return (
    <span className="fs-spinner" style={{ width: size, height: size }} role="status" aria-label={label}>
      <span className="fs-visually-hidden">{label}</span>
    </span>
  )
}
