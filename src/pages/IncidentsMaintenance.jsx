import { useMemo, useState } from 'react'
import Badge from '../components/ui/Badge.jsx'
import Button from '../components/ui/Button.jsx'
import Card from '../components/ui/Card.jsx'
import Icon from '../components/ui/Icon.jsx'
import SegmentedControl from '../components/ui/SegmentedControl.jsx'
import { formatDate, openIncidents, serviceStatus, severityTone } from '../features/factory/model.js'
import { useAppState } from '../state/AppStateContext.jsx'
import { useFactoryData } from '../state/FactoryDataContext.jsx'
import './Workspaces.css'

const TABS = [
  { value: 'incidents', label: 'Incidents' },
  { value: 'maintenance', label: 'Maintenance' },
]

// Every incident and maintenance record in the factory, with the same service
// overdue logic Machine Intelligence and the Command Center use.
export default function IncidentsMaintenance() {
  const { state } = useFactoryData()
  const { openMachine } = useAppState()
  const [tab, setTab] = useState('incidents')

  const code = (id) => state.machines.find((m) => m.id === id)?.code ?? '—'
  const open = openIncidents(state)
  const overdue = useMemo(
    () => state.machines.map((machine) => ({ machine, service: serviceStatus(state, machine) })).filter(({ service }) => service.overdue),
    [state],
  )

  const incidents = useMemo(() => [...state.incidents].sort((a, b) => Date.parse(b.detectedAt) - Date.parse(a.detectedAt)), [state])
  const maintenance = useMemo(() => [...state.maintenanceEvents].sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt)), [state])

  return (
    <div className="fs-page fs-page--wide fs-ws">
      <div className="fs-ws__header">
        <div>
          <h2 className="fs-page__title">
            <Icon name="wrench" size={20} /> Incidents &amp; Maintenance
          </h2>
          <p className="fs-page__subtitle">The full incident and maintenance history behind every machine in the factory.</p>
        </div>
      </div>

      <div className="fs-ws__stats">
        <div className={`fs-ws__stat ${open.length ? 'fs-ws__stat--warning' : ''}`}>
          <span className="fs-ws__stat-label">Open incidents</span>
          <span className="fs-ws__stat-value">{open.length}</span>
        </div>
        <div className={`fs-ws__stat ${overdue.length ? 'fs-ws__stat--danger' : ''}`}>
          <span className="fs-ws__stat-label">Service overdue</span>
          <span className="fs-ws__stat-value">{overdue.length}</span>
        </div>
        <div className="fs-ws__stat">
          <span className="fs-ws__stat-label">Total incidents</span>
          <span className="fs-ws__stat-value">{incidents.length}</span>
        </div>
        <div className="fs-ws__stat">
          <span className="fs-ws__stat-label">Maintenance records</span>
          <span className="fs-ws__stat-value">{maintenance.length}</span>
        </div>
      </div>

      <Card padding="sm">
        <SegmentedControl options={TABS} value={tab} onChange={setTab} label="Incidents or maintenance" />

        {tab === 'incidents' ? (
          <div className="fs-table-wrap">
            <table className="fs-table">
              <thead>
                <tr>
                  <th>Machine</th>
                  <th>Description</th>
                  <th>Severity</th>
                  <th>Status</th>
                  <th>Detected</th>
                  <th>Resolved</th>
                </tr>
              </thead>
              <tbody>
                {incidents.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="fs-muted">
                      No incidents recorded.
                    </td>
                  </tr>
                ) : null}
                {incidents.map((incident) => (
                  <tr key={incident.id} onClick={() => openMachine(incident.machineId)}>
                    <td>
                      <strong>{code(incident.machineId)}</strong>
                    </td>
                    <td>{incident.description}</td>
                    <td>
                      <Badge size="sm" variant={severityTone(incident.severity)}>
                        {incident.severity}
                      </Badge>
                    </td>
                    <td>
                      <Badge size="sm" variant={incident.status === 'open' || incident.status === 'investigating' ? 'warning' : 'neutral'}>
                        {incident.status}
                      </Badge>
                    </td>
                    <td className="fs-nowrap">{formatDate(incident.detectedAt, { withTime: true })}</td>
                    <td className="fs-nowrap">{incident.resolvedAt ? formatDate(incident.resolvedAt, { withTime: true }) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="fs-table-wrap">
            <table className="fs-table">
              <thead>
                <tr>
                  <th>Machine</th>
                  <th>Type</th>
                  <th>Description</th>
                  <th>Occurred</th>
                  <th>Duration</th>
                  <th>Outcome</th>
                </tr>
              </thead>
              <tbody>
                {maintenance.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="fs-muted">
                      No maintenance recorded.
                    </td>
                  </tr>
                ) : null}
                {maintenance.map((event) => (
                  <tr key={event.id} onClick={() => openMachine(event.machineId)}>
                    <td>
                      <strong>{code(event.machineId)}</strong>
                    </td>
                    <td>
                      <Badge size="sm" variant={event.eventType === 'repair' || event.eventType === 'emergency' ? 'info' : event.eventType === 'preventive' ? 'success' : 'neutral'}>
                        {event.eventType}
                      </Badge>
                    </td>
                    <td>{event.description ?? '—'}</td>
                    <td className="fs-nowrap">{formatDate(event.occurredAt, { withTime: true })}</td>
                    <td>{event.durationHours === null ? '—' : `${event.durationHours} h`}</td>
                    <td className="fs-capitalize">{event.outcome?.replaceAll('_', ' ') ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {overdue.length > 0 ? (
        <Card title="Service overdue" description="Past its maintenance interval, from each machine's own record" padding="sm">
          <div className="fs-ws__rows">
            {overdue.map(({ machine, service }) => (
              <div key={machine.id} className="fs-ws__row fs-ws__row--danger">
                <div className="fs-ws__row-main">
                  <div className="fs-ws__row-head">
                    <span className="fs-ws__row-code">{machine.code}</span>
                    <span className="fs-ws__row-name">{machine.name}</span>
                    <Badge variant="danger">{Math.abs(service.daysUntilDue)} days overdue</Badge>
                  </div>
                  <p className="fs-ws__row-note">
                    Last serviced {service.lastServiceAt ? formatDate(service.lastServiceAt) : 'never'} · {machine.maintenanceIntervalDays}-day interval.
                  </p>
                </div>
                <div className="fs-ws__row-actions">
                  <Button size="sm" variant="danger" onClick={() => openMachine(machine.id)}>
                    View machine
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  )
}
