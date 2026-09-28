import Badge from '../ui/Badge.jsx'
import Icon from '../ui/Icon.jsx'
import { NAV_GROUPS, NAV_ITEMS } from './navConfig.js'
import './Sidebar.css'

const ACCENT_CLASS = {
  danger: 'fs-nav-icon--danger',
  success: 'fs-nav-icon--success',
  accent: 'fs-nav-icon--accent',
}

export default function Sidebar({ activeId, onSelect, userName = 'Dev Acharan' }) {
  const initials = userName
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <aside className="fs-sidebar fs-scrollbar">
      <div className="fs-sidebar__header">
        <span className="fs-sidebar__logo">
          <Icon name="factory" size={20} />
        </span>
        <span className="fs-sidebar__wordmark">FORSEER</span>
        <Badge variant="accent" size="sm">
          Prototype
        </Badge>
      </div>

      <nav className="fs-sidebar__nav">
        {NAV_GROUPS.map((group) => {
          const items = NAV_ITEMS.filter((item) => item.group === group && !item.hidden)
          if (items.length === 0) return null
          return (
            <div className="fs-sidebar__group" key={group}>
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={['fs-nav-item', activeId === item.id ? 'fs-nav-item--active' : ''].filter(Boolean).join(' ')}
                  onClick={() => onSelect(item.id)}
                  aria-current={activeId === item.id ? 'page' : undefined}
                >
                  <span className={['fs-nav-icon', item.accent ? ACCENT_CLASS[item.accent] : ''].filter(Boolean).join(' ')}>
                    <Icon name={item.icon} size={17} />
                  </span>
                  <span className="fs-nav-item__text">
                    <span className="fs-nav-item__label">{item.label}</span>
                    {item.subtitle ? <span className="fs-nav-item__subtitle">{item.subtitle}</span> : null}
                  </span>
                </button>
              ))}
            </div>
          )
        })}
      </nav>

      <button type="button" className="fs-sidebar__profile" onClick={() => onSelect('account')}>
        <span className="fs-sidebar__avatar">{initials}</span>
        <span className="fs-sidebar__profile-text">
          <span className="fs-sidebar__profile-name">{userName}</span>
          <span className="fs-sidebar__profile-role">NOVA-01 operator</span>
        </span>
      </button>
    </aside>
  )
}
