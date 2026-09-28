import { useMemo, useState } from 'react'
import Badge from '../components/ui/Badge.jsx'
import Card from '../components/ui/Card.jsx'
import Icon from '../components/ui/Icon.jsx'
import SegmentedControl from '../components/ui/SegmentedControl.jsx'
import { deadlineTone, DEADLINE_ORDER, formatDate, formatRelativeHours, hoursUntil } from '../features/factory/model.js'
import { useAppState } from '../state/AppStateContext.jsx'
import { useFactoryData } from '../state/FactoryDataContext.jsx'
import './Workspaces.css'

const CLOSED_STATUSES = ['completed', 'cancelled']

const FILTERS = [
  { value: 'ALL', label: 'All' },
  { value: 'SAFE', label: 'On track' },
  { value: 'WARNING', label: 'Warning' },
  { value: 'CRITICAL', label: 'Critical' },
  { value: 'BREACHED', label: 'Breached' },
]

function countBy(items, key) {
  const counts = new Map()
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1)
  return counts
}

// Every production order the factory holds, with the engine's live outlook
// against the current plan (no scenario applied).
export default function OrdersProduction() {
  const { state, view } = useFactoryData()
  const { focusOrder } = useAppState()
  const [filter, setFilter] = useState('ALL')

  const rows = useMemo(() => {
    const withStatus = state.orders
      .filter((order) => !CLOSED_STATUSES.includes(order.status))
      .map((order) => ({ order, outlook: view.orderOutlookById.get(order.id) ?? null }))
      .sort((a, b) => DEADLINE_ORDER.indexOf(b.outlook?.baseline.status ?? 'SAFE') - DEADLINE_ORDER.indexOf(a.outlook?.baseline.status ?? 'SAFE') || Date.parse(a.order.deadline) - Date.parse(b.order.deadline))
    return filter === 'ALL' ? withStatus : withStatus.filter((row) => (row.outlook?.baseline.status ?? 'SAFE') === filter)
  }, [state, view, filter])

  const open = state.orders.filter((order) => !CLOSED_STATUSES.includes(order.status))
  const byStatus = countBy(open, (order) => view.orderOutlookById.get(order.id)?.baseline.status ?? 'SAFE')
  const closed = state.orders.length - open.length

  return (
    <div className="fs-page fs-page--wide fs-ws">
      <div className="fs-ws__header">
        <div>
          <h2 className="fs-page__title">
            <Icon name="package" size={20} /> Orders &amp; Production
          </h2>
          <p className="fs-page__subtitle">Every production order, its deadline, and the engine's current-plan outlook.</p>
        </div>
      </div>

      <div className="fs-ws__stats">
        <div className="fs-ws__stat">
          <span className="fs-ws__stat-label">Open orders</span>
          <span className="fs-ws__stat-value">{open.length}</span>
        </div>
        <div className={`fs-ws__stat ${byStatus.get('BREACHED') ? 'fs-ws__stat--danger' : ''}`}>
          <span className="fs-ws__stat-label">Breached</span>
          <span className="fs-ws__stat-value">{byStatus.get('BREACHED') ?? 0}</span>
        </div>
        <div className={`fs-ws__stat ${byStatus.get('CRITICAL') ? 'fs-ws__stat--warning' : ''}`}>
          <span className="fs-ws__stat-label">Critical</span>
          <span className="fs-ws__stat-value">{byStatus.get('CRITICAL') ?? 0}</span>
        </div>
        <div className="fs-ws__stat">
          <span className="fs-ws__stat-label">Warning</span>
          <span className="fs-ws__stat-value">{byStatus.get('WARNING') ?? 0}</span>
        </div>
        <div className="fs-ws__stat">
          <span className="fs-ws__stat-label">On track</span>
          <span className="fs-ws__stat-value">{byStatus.get('SAFE') ?? 0}</span>
        </div>
        <div className="fs-ws__stat">
          <span className="fs-ws__stat-label">Completed / cancelled</span>
          <span className="fs-ws__stat-value">{closed}</span>
        </div>
      </div>

      <Card padding="sm">
        <div className="fs-ws__filters">
          <SegmentedControl options={FILTERS} value={filter} onChange={setFilter} label="Filter by deadline status" />
        </div>
        <div className="fs-table-wrap">
          <table className="fs-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Line</th>
                <th>Priority</th>
                <th>Required</th>
                <th>Deadline</th>
                <th>Projected completion</th>
                <th>Slack</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="fs-muted">
                    No orders match this filter.
                  </td>
                </tr>
              ) : null}
              {rows.map(({ order, outlook }) => (
                <tr key={order.id} onClick={() => focusOrder(order.id)}>
                  <td>
                    <strong>{order.orderNumber}</strong>
                  </td>
                  <td>{state.productionLines.find((l) => l.id === order.productionLineId)?.code}</td>
                  <td className="fs-capitalize">{order.priority}</td>
                  <td>{order.requiredProductionHours} line-h</td>
                  <td className="fs-nowrap">
                    {formatDate(order.deadline)} <span className="fs-muted">{formatRelativeHours(hoursUntil(order.deadline, state.asOf))}</span>
                  </td>
                  <td className="fs-nowrap">{outlook?.baseline.completionAt ? formatDate(outlook.baseline.completionAt, { withTime: true }) : '—'}</td>
                  <td>{outlook?.baseline.slackHours === null ? 'cannot finish' : outlook ? `${outlook.baseline.slackHours} h` : '—'}</td>
                  <td>
                    <Badge size="sm" variant={deadlineTone(outlook?.baseline.status)}>
                      {outlook?.baseline.status ?? '—'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
