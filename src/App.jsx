import { lazy, Suspense } from 'react'
import AppShell from './components/layout/AppShell.jsx'
import { findNavItem } from './components/layout/navConfig.js'
import EmptyState from './components/ui/EmptyState.jsx'
import Icon from './components/ui/Icon.jsx'
import Spinner from './components/ui/Spinner.jsx'
import Button from './components/ui/Button.jsx'
import { ThemeProvider } from './context/ThemeContext.jsx'
import Account from './pages/Account.jsx'
import { PAGE_CONTENT } from './pages/pageContent.js'
import PagePlaceholder from './pages/PagePlaceholder.jsx'
import Settings from './pages/Settings.jsx'
import { AppStateProvider, useAppState } from './state/AppStateContext.jsx'
import { FactoryDataProvider, useFactoryData } from './state/FactoryDataContext.jsx'

const CommandCenter = lazy(() => import('./pages/CommandCenter.jsx'))
const MachineIntelligence = lazy(() => import('./pages/MachineIntelligence.jsx'))
const ScenarioLab = lazy(() => import('./pages/ScenarioLab.jsx'))
const Before = lazy(() => import('./pages/Before.jsx'))
const During = lazy(() => import('./pages/During.jsx'))
const After = lazy(() => import('./pages/After.jsx'))
const OrdersProduction = lazy(() => import('./pages/OrdersProduction.jsx'))
const IncidentsMaintenance = lazy(() => import('./pages/IncidentsMaintenance.jsx'))
const Reports = lazy(() => import('./pages/Reports.jsx'))

// Pages that need the factory data wait for it here.
const DATA_PAGES = {
  'command-center': CommandCenter,
  'machine-intelligence': MachineIntelligence,
  'scenario-lab': ScenarioLab,
  before: Before,
  during: During,
  after: After,
  'orders-production': OrdersProduction,
  'incidents-maintenance': IncidentsMaintenance,
  reports: Reports,
}

const STATIC_PAGES = {
  settings: Settings,
  account: Account,
}

function PageLoading({ label }) {
  return (
    <div className="fs-page-loading">
      <Spinner size={22} />
      <span>{label}</span>
    </div>
  )
}

function DataPage({ Component }) {
  const { loading, error, view, reload } = useFactoryData()
  if (error) {
    return (
      <EmptyState
        icon={<Icon name="alertTriangle" size={26} />}
        title="Factory data could not be loaded"
        description={error.message}
        action={
          <Button variant="primary" onClick={reload}>
            Try again
          </Button>
        }
      />
    )
  }
  if (loading || !view) return <PageLoading label="Loading factory data and running the engine…" />
  return (
    <Suspense fallback={<PageLoading label="Loading…" />}>
      <Component />
    </Suspense>
  )
}

function ActivePage({ activeId }) {
  if (DATA_PAGES[activeId]) return <DataPage Component={DATA_PAGES[activeId]} />
  const StaticPage = STATIC_PAGES[activeId]
  if (StaticPage) return <StaticPage />
  const content = PAGE_CONTENT[activeId]
  return content ? <PagePlaceholder {...content} /> : null
}

function Shell() {
  const { activeId, navigate } = useAppState()
  return (
    <AppShell
      activeId={activeId}
      onSelect={navigate}
      title={findNavItem(activeId).label}
      onOpenSettings={() => navigate('settings')}
      onOpenAccount={() => navigate('account')}
    >
      <ActivePage activeId={activeId} />
    </AppShell>
  )
}

function App() {
  return (
    <ThemeProvider>
      <FactoryDataProvider>
        <AppStateProvider>
          <Shell />
        </AppStateProvider>
      </FactoryDataProvider>
    </ThemeProvider>
  )
}

export default App
