import Icon from './Icon.jsx'
import './Select.css'

// Styled native select: keeps full keyboard and screen-reader behaviour.
export default function Select({ label, value, onChange, options, hint, id, disabled = false }) {
  const selectId = id ?? `fs-select-${label?.replace(/\s+/g, '-').toLowerCase()}`
  return (
    <label className="fs-field" htmlFor={selectId}>
      {label ? <span className="fs-field__label">{label}</span> : null}
      <span className="fs-select">
        <select id={selectId} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
        <Icon name="chevronDown" size={14} className="fs-select__chevron" />
      </span>
      {hint ? <span className="fs-field__hint">{hint}</span> : null}
    </label>
  )
}

export function NumberField({ label, value, onChange, min, max, step = 'any', suffix, hint, id }) {
  const fieldId = id ?? `fs-number-${label?.replace(/\s+/g, '-').toLowerCase()}`
  return (
    <label className="fs-field" htmlFor={fieldId}>
      {label ? <span className="fs-field__label">{label}</span> : null}
      <span className="fs-number">
        <input
          id={fieldId}
          type="number"
          inputMode="decimal"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(event) => onChange(event.target.value)}
        />
        {suffix ? <span className="fs-number__suffix">{suffix}</span> : null}
      </span>
      {hint ? <span className="fs-field__hint">{hint}</span> : null}
    </label>
  )
}
