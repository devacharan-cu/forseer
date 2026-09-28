import Sidebar from './Sidebar.jsx'
import TopBar from './TopBar.jsx'
import './AppShell.css'

export default function AppShell({ activeId, onSelect, title, onOpenSettings, onOpenAccount, children }) {
  return (
    <div className="fs-shell">
      <Sidebar activeId={activeId} onSelect={onSelect} />
      <div className="fs-shell__main">
        <TopBar title={title} onOpenSettings={onOpenSettings} onOpenAccount={onOpenAccount} />
        <main className="fs-shell__content fs-scrollbar">{children}</main>
      </div>
    </div>
  )
}
