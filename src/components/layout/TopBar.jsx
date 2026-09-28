import { useTheme } from '../../context/ThemeContext.jsx'
import Button from '../ui/Button.jsx'
import Dropdown from '../ui/Dropdown.jsx'
import Icon from '../ui/Icon.jsx'
import Input from '../ui/Input.jsx'
import StatusDot from '../ui/StatusDot.jsx'
import Tooltip from '../ui/Tooltip.jsx'
import './TopBar.css'

// NOVA-01 is the only factory this prototype has; the dropdown is real UI wired
// to a single real option rather than a hard-coded label.
const FACTORIES = [{ id: 'NOVA-01', label: 'NOVA-01' }]

export default function TopBar({ title, onOpenSettings, onOpenAccount }) {
  const { theme, toggleTheme } = useTheme()

  return (
    <header className="fs-topbar">
      <div className="fs-topbar__title">
        <h1>{title}</h1>
      </div>

      <div className="fs-topbar__search">
        <Input icon={<Icon name="search" size={16} />} placeholder='Search machines, orders, incidents.. (e.g. "M4", "ORD-0482")' aria-label="Search" />
      </div>

      <div className="fs-topbar__actions">
        <Dropdown
          align="end"
          trigger={({ open }) => (
            <Button variant="outline" size="sm" icon={<Icon name="chevronDown" size={14} />} iconPosition="right">
              {FACTORIES[0].label}
              <span className="fs-visually-hidden">{open ? ' (menu open)' : ''}</span>
            </Button>
          )}
          items={FACTORIES.map((factory) => ({ id: factory.id, label: factory.label, icon: <Icon name="factory" size={15} /> }))}
        />

        <span className="fs-topbar__live">
          <StatusDot variant="success" pulse label="Live" />
        </span>

        <Tooltip content={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            icon={<Icon name={theme === 'dark' ? 'sun' : 'moon'} size={17} />}
            onClick={toggleTheme}
            aria-label="Toggle color theme"
          />
        </Tooltip>

        <Tooltip content="Settings">
          <Button variant="ghost" size="sm" iconOnly icon={<Icon name="settings" size={17} />} onClick={onOpenSettings} aria-label="Open settings" />
        </Tooltip>

        <Dropdown
          align="end"
          trigger={() => (
            <button type="button" className="fs-topbar__avatar" aria-label="Account menu">
              DA
            </button>
          )}
          items={[
            { id: 'account', label: 'Account settings', icon: <Icon name="user" size={15} />, onSelect: onOpenAccount },
            { id: 'settings', label: 'App settings', icon: <Icon name="settings" size={15} />, onSelect: onOpenSettings },
          ]}
        />
      </div>
    </header>
  )
}
