import './ProgressBar.css'

// Shows a ratio the caller already has (e.g. an engine capacity ratio); it never computes one.
export default function ProgressBar({ value, tone = 'accent', label }) {
  const clamped = Math.max(0, Math.min(1, value ?? 0))
  return (
    <span className={`fs-progress fs-progress--${tone}`} role="meter" aria-valuemin={0} aria-valuemax={1} aria-valuenow={clamped} aria-label={label}>
      <span className="fs-progress__fill" style={{ width: `${clamped * 100}%` }} />
    </span>
  )
}
