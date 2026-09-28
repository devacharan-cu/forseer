import Badge from '../components/ui/Badge.jsx'
import Button from '../components/ui/Button.jsx'
import Card from '../components/ui/Card.jsx'
import Icon from '../components/ui/Icon.jsx'
import { formatDate, riskTone, RISK_ORDER, serviceStatus } from '../features/factory/model.js'
import { useAppState } from '../state/AppStateContext.jsx'
import { useFactoryData } from '../state/FactoryDataContext.jsx'
import './Workspaces.css'

const ELEVATED_FROM = RISK_ORDER.indexOf('MODERATE')

// BEFORE mode: every machine FORSEER currently rates MODERATE risk or above,
// with the engine's own signals, plus every machine due or overdue for service.
export default function Before() {
  const { state, view } = useFactoryData()
  const { openMachine, showOnFloor, requestScenario } = useAppState()

  const elevated = view.risks.filter((risk) => RISK_ORDER.indexOf(risk.level) >= ELEVATED_FROM)
  const due = state.machines
    .map((machine) => ({ machine, service: serviceStatus(state, machine) }))
    .filter(({ service }) => service.daysUntilDue !== null && service.daysUntilDue <= 7)
    .sort((a, b) => a.service.daysUntilDue - b.service.daysUntilDue)

  return (
    <div className="fs-page fs-page--wide fs-ws">
      <div className="fs-ws__header">
        <div>
          <h2 className="fs-page__title">
            <Icon name="shield" size={20} /> Before — Prevent failures
          </h2>
          <p className="fs-page__subtitle">Machines FORSEER currently flags, why, and where to simulate a preventive action before anything breaks.</p>
        </div>
      </div>

      <div className="fs-ws__stats">
        <div className={`fs-ws__stat ${elevated.length ? 'fs-ws__stat--warning' : ''}`}>
          <span className="fs-ws__stat-label">Elevated risk</span>
          <span className="fs-ws__stat-value">{elevated.length}</span>
        </div>
        <div className={`fs-ws__stat ${due.filter((d) => d.service.overdue).length ? 'fs-ws__stat--danger' : ''}`}>
          <span className="fs-ws__stat-label">Service overdue</span>
          <span className="fs-ws__stat-value">{due.filter((d) => d.service.overdue).length}</span>
        </div>
        <div className="fs-ws__stat">
          <span className="fs-ws__stat-label">Due within 7 days</span>
          <span className="fs-ws__stat-value">{due.filter((d) => !d.service.overdue).length}</span>
        </div>
        <div className="fs-ws__stat">
          <span className="fs-ws__stat-label">Machines monitored</span>
          <span className="fs-ws__stat-value">{state.machines.length}</span>
        </div>
      </div>

      <Card title="Machines at elevated risk" description="MODERATE and above, ranked by FORSEER's operational risk points — an internal classification, not a failure probability" padding="sm">
        {elevated.length === 0 ? (
          <div className="fs-ws__empty">
            <Icon name="check" size={18} />
            Every machine is currently classified LOW operational risk. Nothing needs preventive action right now.
          </div>
        ) : (
          <div className="fs-ws__rows">
            {elevated.map((risk) => {
              const machine = state.machines.find((m) => m.id === risk.machineId)
              return (
                <div key={risk.machineId} className={`fs-ws__row ${risk.level === 'CRITICAL' ? 'fs-ws__row--danger' : 'fs-ws__row--warning'}`}>
                  <div className="fs-ws__row-main">
                    <div className="fs-ws__row-head">
                      <span className="fs-ws__row-code">{machine.code}</span>
                      <span className="fs-ws__row-name">
                        {machine.name} · {machine.machineType}
                      </span>
                      <Badge variant={riskTone(risk.level)}>
                        {risk.level} · {risk.points} pts
                      </Badge>
                    </div>
                    <ul className="fs-ws__signals">
                      {risk.signals.map((signal) => (
                        <li key={signal.signal}>
                          {signal.signal.replaceAll('_', ' ')} <strong>+{signal.points}</strong>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="fs-ws__row-actions">
                    <Button variant={risk.level === 'CRITICAL' ? 'danger' : 'primary'} size="sm" onClick={() => openMachine(machine.id)}>
                      View machine
                    </Button>
                    <Button variant="secondary" size="sm" icon={<Icon name="flask" size={14} />} onClick={() => requestScenario({ kind: 'failure', machineId: machine.id })}>
                      Compare preventive actions
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

      <Card title="Maintenance due" description="Overdue or due within 7 days, from each machine's service interval" padding="sm">
        {due.length === 0 ? (
          <div className="fs-ws__empty">
            <Icon name="check" size={18} />
            No machine has a service due within the next 7 days.
          </div>
        ) : (
          <div className="fs-table-wrap">
            <table className="fs-table fs-table--static">
              <thead>
                <tr>
                  <th>Machine</th>
                  <th>Last service</th>
                  <th>Interval</th>
                  <th>Due</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {due.map(({ machine, service }) => (
                  <tr key={machine.id}>
                    <td>
                      <strong>{machine.code}</strong> <span className="fs-muted">{machine.name}</span>
                    </td>
                    <td>{service.lastServiceAt ? formatDate(service.lastServiceAt) : '—'}</td>
                    <td>{machine.maintenanceIntervalDays} days</td>
                    <td>
                      <Badge size="sm" variant={service.overdue ? 'danger' : 'warning'}>
                        {service.overdue ? `${Math.abs(service.daysUntilDue)} days overdue` : `in ${service.daysUntilDue} days`}
                      </Badge>
                    </td>
                    <td>
                      <Button size="sm" variant="ghost" onClick={() => openMachine(machine.id)}>
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
    </div>
  )
}
