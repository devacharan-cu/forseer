import './Input.css'

export default function Input({ icon = null, size = 'md', className = '', wrapperClassName = '', ...rest }) {
  return (
    <div className={['fs-input', `fs-input--${size}`, icon ? 'fs-input--with-icon' : '', wrapperClassName].filter(Boolean).join(' ')}>
      {icon ? <span className="fs-input__icon">{icon}</span> : null}
      <input className={['fs-input__field', className].filter(Boolean).join(' ')} {...rest} />
    </div>
  )
}
