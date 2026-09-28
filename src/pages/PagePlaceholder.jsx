import EmptyState from '../components/ui/EmptyState.jsx'
import Icon from '../components/ui/Icon.jsx'

// Every unbuilt module renders through here so navigation is fully wired
// without any page pretending to show real data before it exists.
export default function PagePlaceholder({ icon, title, description }) {
  return (
    <div className="fs-page">
      <EmptyState
        icon={<Icon name={icon} size={26} />}
        title={title}
        description={description}
      />
    </div>
  )
}
