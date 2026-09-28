import { useState } from 'react'
import { useTheme } from '../context/ThemeContext.jsx'
import Badge from '../components/ui/Badge.jsx'
import Button from '../components/ui/Button.jsx'
import Card from '../components/ui/Card.jsx'
import Icon from '../components/ui/Icon.jsx'
import Modal from '../components/ui/Modal.jsx'
import Tabs from '../components/ui/Tabs.jsx'

const TABS = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'about', label: 'About' },
]

export default function Settings() {
  const { theme, setTheme } = useTheme()
  const [activeTab, setActiveTab] = useState('appearance')
  const [confirmOpen, setConfirmOpen] = useState(false)

  return (
    <div className="fs-page">
      <div className="fs-page__header">
        <h2 className="fs-page__title">Settings</h2>
        <p className="fs-page__subtitle">App-wide preferences for this browser.</p>
      </div>

      <Tabs tabs={TABS} activeId={activeTab} onChange={setActiveTab} />

      <div className="fs-page__tab-panel">
        {activeTab === 'appearance' ? (
          <Card title="Theme" description="Choose how FORSEER looks on this device.">
            <div className="fs-settings__theme-options">
              <button
                type="button"
                className={`fs-settings__theme-option ${theme === 'light' ? 'fs-settings__theme-option--active' : ''}`}
                onClick={() => setTheme('light')}
              >
                <Icon name="sun" size={18} />
                Light
                {theme === 'light' ? <Icon name="check" size={14} /> : null}
              </button>
              <button
                type="button"
                className={`fs-settings__theme-option ${theme === 'dark' ? 'fs-settings__theme-option--active' : ''}`}
                onClick={() => setTheme('dark')}
              >
                <Icon name="moon" size={18} />
                Dark
                {theme === 'dark' ? <Icon name="check" size={14} /> : null}
              </button>
            </div>

            <div className="fs-settings__danger">
              <div>
                <p className="fs-settings__danger-title">Reset preferences</p>
                <p className="fs-settings__danger-description">Clears the saved theme choice for this browser.</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setConfirmOpen(true)}>
                Reset
              </Button>
            </div>
          </Card>
        ) : (
          <Card title="About FORSEER">
            <dl className="fs-settings__about">
              <div>
                <dt>Application</dt>
                <dd>FORSEER — Industrial Resilience &amp; Scenario Intelligence</dd>
              </div>
              <div>
                <dt>Factory</dt>
                <dd>NOVA-01</dd>
              </div>
              <div>
                <dt>Build phase</dt>
                <dd>
                  <Badge variant="accent">Phase 4A — Frontend shell</Badge>
                </dd>
              </div>
            </dl>
          </Card>
        )}
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Reset preferences?"
        description="This clears your saved theme choice. Your factory data is not affected."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                localStorage.removeItem('forseer-theme')
                setConfirmOpen(false)
              }}
            >
              Reset
            </Button>
          </>
        }
      >
        <p>You can change the theme again at any time from Settings or the topbar toggle.</p>
      </Modal>
    </div>
  )
}
