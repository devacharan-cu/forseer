import './SegmentedControl.css'

export default function SegmentedControl({ options, value, onChange, size = 'md', label }) {
  return (
    <div className={`fs-segmented fs-segmented--${size}`} role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          className={`fs-segmented__option ${value === option.value ? 'fs-segmented__option--active' : ''}`}
          onClick={() => onChange(option.value)}
        >
          {option.icon ? <span className="fs-segmented__icon">{option.icon}</span> : null}
          {option.label}
        </button>
      ))}
    </div>
  )
}
