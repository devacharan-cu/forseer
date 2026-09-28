import Badge from '../components/ui/Badge.jsx'
import Button from '../components/ui/Button.jsx'
import Card from '../components/ui/Card.jsx'
import Icon from '../components/ui/Icon.jsx'
import {
  exposureOf,
  formatDaysAgo,
  incidentsFor,
  linesForMachine,
  openIncidents,
  riskTone,
  severityTone,
  STATE_LABEL,
  stateTone,
} from '../features/factory/model.js'
import { useAppState } from '../state/AppStateContext.jsx'
import { useFactoryData } from '../state/FactoryDataContext.jsx'
import './Workspaces.css'

// DURING mode: what is unfolding right now — machines actually down or degraded,
// the open incidents behind them, and what they are putting at risk downstream.
export default function During() {
  const { state, view } = useFactoryData()
  const { openMachine, showOnFloor } = useAppState()

  const down = state.machines.filter((m) => m.baselineState === 'failed' || m.baselineState === 'degraded')
  const watched = state.machines.filter((m) => m.baselineState === 'at_risk' || m.baselineState === 'monitoring')
  const incidents = openIncidents(state)

  return (
    <div className="fs-page fs-page--wide fs-ws">
      <div className="fs-ws__header">
        <div>
          <h2 className="fs-page__title">
            <Icon name="activity" size={20} /> During — Monitor &amp; contain
          </h2>
          <p className="fs-page__subtitle">What is unfolding right now, what it threatens downstream, and where to act.</p>
        </div>
      </div>

      <div className="fs-ws__stats">
        <div className={`fs-ws__stat ${down.length ? 'fs-ws__stat--danger' : ''}`}>
          <span className="fs-ws__stat-label">Down or degraded</span>
          <span className="fs-ws__stat-value">{down.length}</span>
        </div>
        <div className={`fs-ws__stat ${incidents.length ? 'fs-ws__stat--warning' : ''}`}>
          <span className="fs-ws__stat-label">Open incidents</span>
          <span className="fs-ws__stat-value">{incidents.length}</span>
        </div>
        <div className="fs-ws__stat">
          <span className="fs-ws__stat-label">Being watched</span>
          <span className="fs-ws__stat-value">{watched.length}</span>
        </div>
      </div>

      <Card title="Machines down or degraded" description="Recorded state right now, and what stops downstream because of it" padding="sm">
        {down.length === 0 ? (
          <div className="fs-ws__empty">
            <Icon name="check" size={18} />
            No machine is currently down or degraded — production is running at its recorded capacity.
          </div>
        ) : (
          <div className="fs-ws__rows">
            {down.map((machine) => {
              const exposure = exposureOf(state, view, machine.id)
              const notSafe = exposure.orders.filter((o) => o.outlook && o.outlook.baseline.status !== 'SAFE')
              const incident = incidentsFor(state, machine.id).find((i) => i.status === 'open' || i.status === 'investigating')
              return (
                <div key={machine.id} className="fs-ws__row fs-ws__row--danger">
                  <div className="fs-ws__row-main">
                    <div className="fs-ws__row-head">
                      <span className="fs-ws__row-code">{machine.code}</span>
                      <span className="fs-ws__row-name">{machine.name}</span>
                      <Badge variant={stateTone(machine.baselineState)} dot>
                        {STATE_LABEL[machine.baselineState]}
                      </Badge>
                    </div>
                    <p className="fs-ws__row-note">
                      Feeds {exposure.downstream.map((m) => m.code).join(', ') || 'no other machines'} on {linesForMachine(state, machine.id).map((l) => l.code).join(', ')}.
                      {notSafe.length ? ` ${notSafe.length} order${notSafe.length === 1 ? '' : 's'} not on track: ${notSafe.map((o) => o.order.orderNumber).join(', ')}.` : ' No open order is off track yet.'}
                    </p>
                    {incident ? <p className="fs-ws__row-quote">“{incident.description}” — {formatDaysAgo(incident.detectedAt, state.asOf)}</p> : null}
                  </div>
                  <div className="fs-ws__row-actions">
                    <Button variant="danger" size="sm" onClick={() => openMachine(machine.id)}>
                      View machine
                    </Button>
                    <Button variant="ghost" size="sm" icon={<Icon name="cube" size={14} />} onClick={() => showOnFloor(machine.id)}>
                      Show on floor
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      <Card title="Open incidents" description="Unresolved reports, most recent first" padding="sm">
        {incidents.length === 0 ? (
          <div className="fs-ws__empty">
            <Icon name="check" size={18} />
            No open incidents.
          </div>
        ) : (
          <div className="fs-table-wrap">
            <table className="fs-table fs-table--static">
              <thead>
                <tr>
                  <th>Machine</th>
                  <th>Description</th>
                  <th>Severity</th>
                  <th>Status</th>
                  <th>Detected</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {[...incidents]
                  .sort((a, b) => Date.parse(b.detectedAt) - Date.parse(a.detectedAt))
                  .map((incident) => (
                    <tr key={incident.id}>
                      <td>
                        <strong>{state.machines.find((m) => m.id === incident.machineId)?.code}</strong>
                      </td>
                      <td>{incident.description}</td>
                      <td>
                        <Badge size="sm" variant={severityTone(incident.severity)}>
                          {incident.severity}
                        </Badge>
                      </td>
                      <td className="fs-capitalize">{incident.status}</td>
                      <td className="fs-nowrap">{formatDaysAgo(incident.detectedAt, state.asOf)}</td>
                      <td>
                        <Button size="sm" variant="ghost" onClick={() => openMachine(incident.machineId)}>
                          View
                        </Button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Being watched" description="Elevated recorded state, not yet down — worth containing before it becomes an incident" padding="sm">
        {watched.length === 0 ? (
          <div className="fs-ws__empty">
            <Icon name="check" size={18} />
            No machine is on watch.
          </div>
        ) : (
          <div className="fs-ws__rows">
            {watched.map((machine) => {
              const risk = view.riskById.get(machine.id)
              return (
                <div key={machine.id} className="fs-ws__row">
                  <div className="fs-ws__row-main">
                    <div className="fs-ws__row-head">
                      <span className="fs-ws__row-code">{machine.code}</span>
                      <span className="fs-ws__row-name">{machine.name}</span>
                      <Badge variant={stateTone(machine.baselineState)} dot>
                        {STATE_LABEL[machine.baselineState]}
                      </Badge>
                      <Badge variant={riskTone(risk.level)}>{risk.level} risk</Badge>
                    </div>
                  </div>
                  <div className="fs-ws__row-actions">
                    <Button size="sm" variant="secondary" onClick={() => openMachine(machine.id)}>
                      View machine
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}
