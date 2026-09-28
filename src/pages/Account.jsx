import Badge from '../components/ui/Badge.jsx'
import Card from '../components/ui/Card.jsx'

export default function Account() {
  return (
    <div className="fs-page">
      <div className="fs-page__header">
        <h2 className="fs-page__title">Account</h2>
        <p className="fs-page__subtitle">Sign-in and user management are not part of this prototype yet.</p>
      </div>

      <Card title="Current session">
        <div className="fs-account__row">
          <span className="fs-account__avatar">DA</span>
          <div>
            <p className="fs-account__name">Dev Acharan</p>
            <p className="fs-account__meta">NOVA-01 operator · local prototype session</p>
          </div>
          <Badge variant="neutral">No authentication yet</Badge>
        </div>
      </Card>
    </div>
  )
}
