import { useMemo } from 'react'
import Badge from '../components/ui/Badge.jsx'
import Button from '../components/ui/Button.jsx'
import Card from '../components/ui/Card.jsx'
import Icon from '../components/ui/Icon.jsx'
import { findRecurringPatterns } from '../engine/index.js'
import { formatDate, hoursUntil, severityTone } from '../features/factory/model.js'
import { useAppState } from '../state/AppStateContext.jsx'
import { useFactoryData } from '../state/FactoryDataContext.jsx'
import './Workspaces.css'

const RECENT_DAYS = 90

function hoursBetween(a, b) {
  return Math.round(((Date.parse(b) - Date.parse(a)) / 3_600_000) * 10) / 10
}

// AFTER mode: what has already been resolved, how long recovery took, and the
// recurring incident patterns the engine's keyword recurrence check has found —
// descriptive history, not a prediction of what happens next.
export default function After() {
  const { state } = useFactoryData()
  const { openMachine } = useAppState()

  const resolved = useMemo(
    () =>
      state.incidents
        .filter((i) => i.status === 'resolved' || i.status === 'closed')
        .filter((i) => i.resolvedAt && hoursUntil(i.resolvedAt, state.asOf) > -24 * RECENT_DAYS)
        .sort((a, b) => Date.parse(b.resolvedAt) - Date.parse(a.resolvedAt)),
    [state],
  )

  const recentWork = useMemo(
    () =>
      state.maintenanceEvents
        .filter((e) => ['repair', 'emergency', 'preventive'].includes(e.eventType))
        .filter((e) => hoursUntil(e.occurredAt, state.asOf) > -24 * RECENT_DAYS)
        .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt)),
    [state],
  )

  const patterns = useMemo(
    () =>
      state.machines
        .flatMap((machine) => findRecurringPatterns(state, machine.id).map((pattern) => ({ machine, pattern })))
        .filter(({ pattern }) => pattern.recurrenceDetected),
    [state],
  )

  return (
    <div className="fs-page fs-page--wide fs-ws">
      <div className="fs-ws__header">
        <div>
          <h2 className="fs-page__title">
            <Icon name="history" size={20} /> After — Recover &amp; learn
          </h2>
          <p className="fs-page__subtitle">What has already been resolved, the work it took, and recurring patterns worth acting on.</p>
        </div>
      </div>

      <div className="fs-ws__stats">
        <div className="fs-ws__stat">
          <span className="fs-ws__stat-label">Resolved, last {RECENT_DAYS} days</span>
          <span className="fs-ws__stat-value">{resolved.length}</span>
        </div>
        <div className="fs-ws__stat">
          <span className="fs-ws__stat-label">Repairs &amp; services logged</span>
          <span className="fs-ws__stat-value">{recentWork.length}</span>
        </div>
        <div className={`fs-ws__stat ${patterns.length ? 'fs-ws__stat--warning' : ''}`}>
          <span className="fs-ws__stat-label">Recurring patterns</span>
          <span className="fs-ws__stat-value">{patterns.length}</span>
        </div>
      </div>

      <Card title="Recurring incident patterns" description="Keyword recurrence in each machine's incident history — descriptive, not predictive" padding="sm">
        {patterns.length === 0 ? (
          <div className="fs-ws__empty">
            <Icon name="check" size={18} />
            No machine has a recurring incident keyword in its history.
          </div>
        ) : (
          <div className="fs-ws__rows">
            {patterns.map(({ machine, pattern }) => (
              <div key={`${machine.id}-${pattern.matchedPattern}`} className="fs-ws__row fs-ws__row--warning">
                <div className="fs-ws__row-main">
                  <div className="fs-ws__row-head">
                    <span className="fs-ws__row-code">{machine.code}</span>
                    <span className="fs-ws__row-name">{machine.name}</span>
                    <Badge variant="warning" className="fs-capitalize">
                      {pattern.matchedPattern}
                    </Badge>
                  </div>
                  <p className="fs-ws__row-note">
                    {pattern.occurrences} occurrences in the last {pattern.lookbackDays} days, {formatDate(pattern.firstOccurrence)} to {formatDate(pattern.recentOccurrence)}
                    {pattern.occurrencesAfterLastRepair ? `, including ${pattern.occurrencesAfterLastRepair} after the ${formatDate(pattern.lastRepairAt)} repair` : ''}.
                  </p>
                </div>
                <div className="fs-ws__row-actions">
                  <Button size="sm" variant="secondary" onClick={() => openMachine(machine.id)}>
                    Investigate
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Recently resolved incidents" description={`Closed within the last ${RECENT_DAYS} days, most recent first`} padding="sm">
        {resolved.length === 0 ? (
          <div className="fs-ws__empty">
            <Icon name="check" size={18} />
            No incident has been resolved in the last {RECENT_DAYS} days.
          </div>
        ) : (
          <div className="fs-table-wrap">
            <table className="fs-table fs-table--static">
              <thead>
                <tr>
                  <th>Machine</th>
                  <th>Description</th>
                  <th>Severity</th>
                  <th>Detected</th>
                  <th>Resolved</th>
                  <th>Time to resolve</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {resolved.map((incident) => (
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
                    <td className="fs-nowrap">{formatDate(incident.detectedAt)}</td>
                    <td className="fs-nowrap">{formatDate(incident.resolvedAt)}</td>
                    <td>{hoursBetween(incident.detectedAt, incident.resolvedAt)} h</td>
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

      <Card title="Recovery work logged" description="Repairs, emergency work and preventive services in the same window" padding="sm">
        {recentWork.length === 0 ? (
          <div className="fs-ws__empty">
            <Icon name="check" size={18} />
            No repair or service has been logged in the last {RECENT_DAYS} days.
          </div>
        ) : (
          <div className="fs-table-wrap">
            <table className="fs-table fs-table--static">
              <thead>
                <tr>
                  <th>Machine</th>
                  <th>Type</th>
                  <th>Description</th>
                  <th>Date</th>
                  <th>Duration</th>
                  <th>Outcome</th>
                </tr>
              </thead>
              <tbody>
                {recentWork.map((event) => (
                  <tr key={event.id}>
                    <td>
                      <strong>{state.machines.find((m) => m.id === event.machineId)?.code}</strong>
                    </td>
                    <td>
                      <Badge size="sm" variant={event.eventType === 'preventive' ? 'success' : 'info'}>
                        {event.eventType}
                      </Badge>
                    </td>
                    <td>{event.description ?? '—'}</td>
                    <td className="fs-nowrap">{formatDate(event.occurredAt)}</td>
                    <td>{event.durationHours === null ? '—' : `${event.durationHours} h`}</td>
                    <td className="fs-capitalize">{event.outcome?.replaceAll('_', ' ') ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
