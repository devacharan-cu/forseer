import { useTheme } from '../../context/ThemeContext.jsx'
import { useFactoryData } from '../../state/FactoryDataContext.jsx'
import Button from '../ui/Button.jsx'
import Dropdown from '../ui/Dropdown.jsx'
import Icon from '../ui/Icon.jsx'
import StatusDot from '../ui/StatusDot.jsx'
import Tooltip from '../ui/Tooltip.jsx'
import SearchBox from './SearchBox.jsx'
import './TopBar.css'

// NOVA-01 is the only factory this prototype has; the dropdown is real UI wired
// to a single real option rather than a hard-coded label.
const FACTORIES = [{ id: 'NOVA-01', label: 'NOVA-01' }]

// Says exactly where the numbers on screen come from.
function DataSource() {
  const { source, warning, loading, supabaseConfigured, loadedAt, reload } = useFactoryData()
  const label = loading ? 'Loading…' : source === 'supabase' ? 'Supabase · live' : 'Seed snapshot'
  const tip = loading
    ? 'Loading factory data'
    : source === 'supabase'
      ? `Live data from Supabase, loaded ${new Date(loadedAt).toLocaleTimeString()}`
      : warning ?? (supabaseConfigured ? 'Seed snapshot' : 'Supabase is not configured — showing the NOVA-01 seed data (identical to supabase/seed.sql)')
  return (
    <span className="fs-topbar__source">
      <Tooltip content={tip}>
        <span className="fs-topbar__source-label" tabIndex={0}>
          <StatusDot variant={source === 'supabase' ? 'success' : warning ? 'warning' : 'neutral'} pulse={source === 'supabase'} label={label} />
        </span>
      </Tooltip>
      <Tooltip content="Reload factory data">
        <Button variant="ghost" size="sm" iconOnly icon={<Icon name="refresh" size={15} />} onClick={reload} disabled={loading} aria-label="Reload factory data" />
      </Tooltip>
    </span>
  )
}

export default function TopBar({ title, onOpenSettings, onOpenAccount }) {
  const { theme, toggleTheme } = useTheme()

  return (
    <header className="fs-topbar">
      <div className="fs-topbar__title">
        <h1>{title}</h1>
      </div>

      <div className="fs-topbar__search">
        <SearchBox />
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

        <DataSource />

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
