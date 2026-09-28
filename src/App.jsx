import { useState } from 'react'
import AppShell from './components/layout/AppShell.jsx'
import { findNavItem } from './components/layout/navConfig.js'
import { ThemeProvider } from './context/ThemeContext.jsx'
import Account from './pages/Account.jsx'
import { PAGE_CONTENT } from './pages/pageContent.js'
import PagePlaceholder from './pages/PagePlaceholder.jsx'
import Settings from './pages/Settings.jsx'

const PAGE_COMPONENTS = {
  settings: Settings,
  account: Account,
}

function ActivePage({ activeId }) {
  const PageComponent = PAGE_COMPONENTS[activeId]
  if (PageComponent) return <PageComponent />

  const content = PAGE_CONTENT[activeId]
  if (!content) return null
  return <PagePlaceholder {...content} />
}

function App() {
  const [activeId, setActiveId] = useState('command-center')

  return (
    <ThemeProvider>
      <AppShell
        activeId={activeId}
        onSelect={setActiveId}
        title={findNavItem(activeId).label}
        onOpenSettings={() => setActiveId('settings')}
        onOpenAccount={() => setActiveId('account')}
      >
        <ActivePage activeId={activeId} />
      </AppShell>
    </ThemeProvider>
  )
}

export default App
