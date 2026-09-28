import { lazy, Suspense, useState } from 'react'
import { analyzeMachineRisk } from '../ai/index.js'
import Badge from '../components/ui/Badge.jsx'
import Button from '../components/ui/Button.jsx'
import Card from '../components/ui/Card.jsx'
import Icon from '../components/ui/Icon.jsx'
import ProgressBar from '../components/ui/ProgressBar.jsx'
import Spinner from '../components/ui/Spinner.jsx'
import Tabs from '../components/ui/Tabs.jsx'
import { DEFAULT_ENGINE_CONFIG, findRecurringPatterns } from '../engine/index.js'
import AiPanel from '../features/ai/AiPanel.jsx'
import {
  andonFor,
  assignmentFor,
  backupsOf,
  deadlineTone,
  downstreamOf,
  exposureOf,
  formatDate,
  formatDaysAgo,
  formatRelativeHours,
  hoursUntil,
  incidentsFor,
  linesForMachine,
  maintenanceFor,
  riskTone,
  serviceStatus,
  STATE_LABEL,
  stateTone,
  transitiveDownstream,
  upstreamOf,
} from '../features/factory/model.js'
import ActivityTimeline from '../features/machine/ActivityTimeline.jsx'
import { useAppState } from '../state/AppStateContext.jsx'
import { useFactoryData } from '../state/FactoryDataContext.jsx'
import './MachineIntelligence.css'

const MachineStage = lazy(() => import('../features/factory3d/MachineStage.jsx'))
const ImpactGraph = lazy(() => import('../features/impact/ImpactGraph.jsx'))

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'risk', label: 'Health & Risk' },
  { id: 'history', label: 'History' },
  { id: 'maintenance', label: 'Maintenance' },
  { id: 'dependencies', label: 'Dependencies & Impact' },
]

const SIGNAL_COPY = {
  currently_failed: () => 'Machine is recorded as down',
  degraded_status: () => 'Machine is recorded as degraded',
  health_state: (d) => `Health state recorded as “${d.healthState.replaceAll('_', ' ')}”`,
  no_maintenance_record: () => 'No maintenance record on file',
  maintenance_overdue: (d) => `Last service ${d.daysSinceService} days ago; interval is ${d.maintenanceIntervalDays} days`,
  maintenance_severely_overdue: (d) => `Last service ${d.daysSinceService} days ago; interval is ${d.maintenanceIntervalDays} days`,
  unresolved_incident: (d) => `${d.count} open incident${d.count === 1 ? '' : 's'}, worst severity ${d.highestSeverity}`,
  recurring_incident_pattern: (d) => d.patterns.map((p) => `“${p.pattern}” in ${p.occurrences} incidents`).join(', '),
  recurrence_after_repair: (d) => d.patterns.map((p) => `“${p.pattern}” recurred ${p.occurrencesAfterRepair}× after the ${formatDate(d.lastRepairAt)} repair`).join(', '),
  overloaded: (d) => `Assigned load exceeds usable capacity (${Math.round(d.utilization * 100)}%)`,
}

function MachinePicker({ activeId, onPick }) {
  const { state, view } = useFactoryData()
  return (
    <nav className="fs-mi__picker" aria-label="Machines">
      {state.productionLines.map((line) => {
        const machines = state.machines.filter((m) => linesForMachine(state, m.id)[0]?.id === line.id)
        return (
          <div key={line.id} className="fs-mi__picker-group">
            <div className="fs-mi__picker-line">{line.code}</div>
            {machines.map((m) => {
              const risk = view.riskById.get(m.id)
              return (
                <button key={m.id} type="button" className={`fs-mi__picker-item ${m.id === activeId ? 'is-active' : ''}`} onClick={() => onPick(m.id)}>
                  <span className={`fs-mi__dot fs-mi__dot--${m.baselineState === 'failed' ? 'danger' : riskTone(risk.level)}`} />
                  <span className="fs-mi__picker-code">{m.code}</span>
                  <span className="fs-mi__picker-name">{m.name}</span>
                  {risk.level !== 'LOW' ? <span className={`fs-mi__picker-risk fs-text-${riskTone(risk.level)}`}>{risk.level}</span> : null}
                </button>
              )
            })}
          </div>
        )
      })}
    </nav>
  )
}

function Fact({ label, children, tone }) {
  return (
    <div className="fs-mi__fact">
      <dt>{label}</dt>
      <dd className={tone ? `fs-text-${tone}` : ''}>{children}</dd>
    </div>
  )
}

function Overview({ machine }) {
  const { state, view } = useFactoryData()
  const risk = view.riskById.get(machine.id)
  const capacity = view.capacityByMachineId.get(machine.id)
  const service = serviceStatus(state, machine)
  const exposure = exposureOf(state, view, machine.id)
  const lines = linesForMachine(state, machine.id)
  const open = incidentsFor(state, machine.id).filter((i) => i.status === 'open' || i.status === 'investigating')
  const utilTone = capacity.utilization === null ? 'neutral' : capacity.utilization > 1 ? 'danger' : capacity.utilization >= 0.9 ? 'warning' : 'success'

  return (
    <div className="fs-mi__overview">
      <div className="fs-mi__stage">
        <Suspense fallback={<div className="fs-mi__stage-loading"><Spinner /></div>}>
          <MachineStage machineType={machine.machineType} lit={andonFor(machine.baselineState, risk.level)} height="100%" />
        </Suspense>
      </div>
      <Card title="Machine status" padding="sm">
        <dl className="fs-mi__facts">
          <Fact label="Recorded state">
            <Badge size="sm" variant={stateTone(machine.baselineState)} dot>
              {STATE_LABEL[machine.baselineState]}
            </Badge>
          </Fact>
          <Fact label="Operational risk">
            <Badge size="sm" variant={riskTone(risk.level)}>
              {risk.level} · {risk.points} pts
            </Badge>
          </Fact>
          <Fact label="Assigned load">
            {capacity.assignedLoadPerHour} of {capacity.usableCapacityPerHour} per h usable
          </Fact>
          <div className="fs-mi__fact fs-mi__fact--bar">
            <dt>Utilization</dt>
            <dd>
              <ProgressBar value={capacity.utilization ?? 0} tone={utilTone} label="Utilization" />
              <span>{capacity.utilization === null ? 'no usable capacity' : `${Math.round(capacity.utilization * 100)}%`}</span>
            </dd>
          </div>
          <Fact label="Rated capacity">{machine.capacityPerHour} per h</Fact>
          <Fact label="Line">{lines.map((l) => `${l.code} (${assignmentFor(state, machine.id, l.id)?.contributionPerHour}/h)`).join(', ') || '—'}</Fact>
          <Fact label="Last service" tone={service.overdue ? 'danger' : undefined}>
            {service.lastServiceAt ? `${formatDate(service.lastServiceAt)} · ${formatDaysAgo(service.lastServiceAt, state.asOf)}` : 'No record'}
          </Fact>
          <Fact label="Next service due" tone={service.overdue ? 'danger' : service.daysUntilDue !== null && service.daysUntilDue <= 7 ? 'warning' : undefined}>
            {service.nextDueAt ? `${formatDate(service.nextDueAt)} · ${service.overdue ? `${Math.abs(service.daysUntilDue)} days overdue` : `in ${service.daysUntilDue} days`}` : '—'}
          </Fact>
          <Fact label="Service interval">{machine.maintenanceIntervalDays} days</Fact>
          <Fact label="Open incidents" tone={open.length ? 'danger' : undefined}>
            {open.length}
          </Fact>
        </dl>
      </Card>

      <Card title="Production exposure" description="What depends on this machine, with the engine's deadline outlook for the current plan" padding="sm" className="fs-mi__wide">
        <div className="fs-mi__exposure-head">
          <span>
            Feeds <strong>{exposure.downstream.map((m) => m.code).join(' → ') || 'no downstream machines'}</strong>
          </span>
          <span>
            on <strong>{exposure.lines.map((l) => l.code).join(', ')}</strong>
          </span>
        </div>
        <div className="fs-table-wrap">
          <table className="fs-table fs-table--static">
            <thead>
              <tr>
                <th>Order</th>
                <th>Priority</th>
                <th>Deadline</th>
                <th>Projected completion</th>
                <th>Slack</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {exposure.orders.map(({ order, outlook }) => (
                <tr key={order.id}>
                  <td>
                    <strong>{order.orderNumber}</strong>
                  </td>
                  <td className="fs-capitalize">{order.priority}</td>
                  <td>
                    {formatDate(order.deadline)} <span className="fs-muted">{formatRelativeHours(hoursUntil(order.deadline, state.asOf))}</span>
                  </td>
                  <td>{outlook?.baseline.completionAt ? formatDate(outlook.baseline.completionAt, { withTime: true }) : '—'}</td>
                  <td>{outlook?.baseline.slackHours === null ? 'cannot finish' : `${outlook.baseline.slackHours} h`}</td>
                  <td>
                    <Badge size="sm" variant={deadlineTone(outlook?.baseline.status)}>
                      {outlook?.baseline.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Activity" description="Incidents and maintenance on record, last 180 days" padding="sm" className="fs-mi__wide">
        <ActivityTimeline incidents={incidentsFor(state, machine.id)} maintenance={maintenanceFor(state, machine.id)} asOf={state.asOf} />
      </Card>
    </div>
  )
}

function HealthRisk({ machine }) {
  const { state, view } = useFactoryData()
  const risk = view.riskById.get(machine.id)
  const patterns = findRecurringPatterns(state, machine.id)
  const maxPoints = Math.max(1, ...risk.signals.map((s) => s.points))

  return (
    <div className="fs-mi__grid">
      <Card padding="sm">
        <div className={`fs-mi__riskhead fs-mi__riskhead--${riskTone(risk.level)}`}>
          <div>
            <span className="fs-mi__risklabel">FORSEER operational risk</span>
            <span className="fs-mi__risklevel">{risk.level}</span>
          </div>
          <div className="fs-mi__riskpoints">
            <strong>{risk.points}</strong>
            <span>points</span>
          </div>
        </div>
        <p className="fs-mi__disclaimer">{risk.disclaimer}</p>
        {risk.signals.length === 0 ? (
          <p className="fs-muted">No risk signals: recorded state, service history and incidents are all within limits.</p>
        ) : (
          <ul className="fs-mi__signals">
            {risk.signals.map((signal) => (
              <li key={signal.signal}>
                <div className="fs-mi__signal-head">
                  <span className="fs-capitalize">{signal.signal.replaceAll('_', ' ')}</span>
                  <strong>+{signal.points}</strong>
                </div>
                <ProgressBar value={signal.points / maxPoints} tone={signal.points >= 3 ? 'danger' : 'warning'} label={signal.signal} />
                <p>{SIGNAL_COPY[signal.signal]?.(signal.detail) ?? ''}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="fs-mi__stack">
        <Card title="Recurring incident patterns" description={`Keyword recurrence in the last ${DEFAULT_ENGINE_CONFIG.patterns.lookbackDays} days (descriptive, not predictive)`} padding="sm">
          {patterns.length === 0 ? (
            <p className="fs-muted">No recurring keywords in this machine's incident history.</p>
          ) : (
            <div className="fs-table-wrap">
              <table className="fs-table fs-table--static">
                <thead>
                  <tr>
                    <th>Pattern</th>
                    <th>Occurrences</th>
                    <th>First</th>
                    <th>Latest</th>
                    <th>After last repair</th>
                  </tr>
                </thead>
                <tbody>
                  {patterns.map((p) => (
                    <tr key={p.matchedPattern}>
                      <td>
                        <strong className="fs-capitalize">{p.matchedPattern}</strong>{' '}
                        {p.recurrenceDetected ? (
                          <Badge size="sm" variant="danger">
                            recurring
                          </Badge>
                        ) : null}
                      </td>
                      <td>{p.occurrences}</td>
                      <td>{formatDate(p.firstOccurrence)}</td>
                      <td>{formatDate(p.recentOccurrence)}</td>
                      <td>{p.occurrencesAfterLastRepair ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <AiPanel
          title="AI risk explanation"
          description="Plain-language reading of the engine's signals and history"
          run={(provider) => analyzeMachineRisk({ provider, factoryState: state, machineId: machine.id })}
          render={(result) => (
            <>
              <p>{result.analysis.summary}</p>
              <h4>Contributing factors</h4>
              <ul>
                {result.analysis.contributingFactors.map((f) => (
                  <li key={f.signal}>{f.explanation}</li>
                ))}
              </ul>
              {result.analysis.historicalEvidence.length ? (
                <>
                  <h4>Historical evidence</h4>
                  <ul>
                    {result.analysis.historicalEvidence.map((e) => (
                      <li key={`${e.reference}-${e.observation}`}>{e.observation}</li>
                    ))}
                  </ul>
                </>
              ) : null}
              <h4>Concerns</h4>
              <ul>
                {result.analysis.concerns.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
              {result.analysis.suggestedPreventiveActions.length ? (
                <>
                  <h4>Ideas to simulate</h4>
                  <ul>
                    {result.analysis.suggestedPreventiveActions.map((a) => (
                      <li key={`${a.actionType}-${a.description}`}>
                        <span className="fs-chip">{a.actionType.replaceAll('_', ' ')}</span> {a.description}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
              <h4>Uncertainty</h4>
              <p>{result.analysis.uncertainty}</p>
            </>
          )}
        />
      </div>
    </div>
  )
}

function History({ machine }) {
  const { state } = useFactoryData()
  const incidents = incidentsFor(state, machine.id)
  return (
    <div className="fs-mi__stack">
      <Card title="Activity timeline" padding="sm">
        <ActivityTimeline incidents={incidents} maintenance={maintenanceFor(state, machine.id)} asOf={state.asOf} />
      </Card>
      <Card title="Incidents" description={`${incidents.length} on record`} padding="sm">
        {incidents.length === 0 ? (
          <p className="fs-muted">No incidents recorded for {machine.code}.</p>
        ) : (
          <div className="fs-table-wrap">
            <table className="fs-table fs-table--static">
              <thead>
                <tr>
                  <th>Detected</th>
                  <th>Description</th>
                  <th>Severity</th>
                  <th>Status</th>
                  <th>Resolved</th>
                </tr>
              </thead>
              <tbody>
                {incidents.map((incident) => (
                  <tr key={incident.id}>
                    <td className="fs-nowrap">{formatDate(incident.detectedAt)}</td>
                    <td>{incident.description}</td>
                    <td>
                      <Badge size="sm" variant={incident.severity === 'high' || incident.severity === 'critical' ? 'danger' : incident.severity === 'medium' ? 'warning' : 'neutral'}>
                        {incident.severity}
                      </Badge>
                    </td>
                    <td className="fs-capitalize">{incident.status}</td>
                    <td className="fs-nowrap">{incident.resolvedAt ? formatDate(incident.resolvedAt) : '—'}</td>
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

function Maintenance({ machine }) {
  const { state } = useFactoryData()
  const events = maintenanceFor(state, machine.id)
  const service = serviceStatus(state, machine)
  return (
    <div className="fs-mi__stack">
      <div className="fs-mi__service">
        <Card padding="sm">
          <span className="fs-mi__service-label">Last service</span>
          <strong>{service.lastServiceAt ? formatDate(service.lastServiceAt) : '—'}</strong>
          <span className="fs-muted">{service.lastService ? `${service.lastService.eventType} · ${service.lastService.description}` : 'from the machine record'}</span>
        </Card>
        <Card padding="sm">
          <span className="fs-mi__service-label">Next due</span>
          <strong className={service.overdue ? 'fs-text-danger' : ''}>{service.nextDueAt ? formatDate(service.nextDueAt) : '—'}</strong>
          <span className="fs-muted">{service.daysUntilDue === null ? '' : service.overdue ? `${Math.abs(service.daysUntilDue)} days overdue` : `in ${service.daysUntilDue} days`}</span>
        </Card>
        <Card padding="sm">
          <span className="fs-mi__service-label">Interval</span>
          <strong>{machine.maintenanceIntervalDays} days</strong>
          <span className="fs-muted">inspections and calibrations do not reset it</span>
        </Card>
      </div>
      <Card title="Maintenance record" description={`${events.length} events`} padding="sm">
        <div className="fs-table-wrap">
          <table className="fs-table fs-table--static">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Description</th>
                <th>Duration</th>
                <th>Outcome</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td className="fs-nowrap">{formatDate(event.occurredAt)}</td>
                  <td>
                    <Badge size="sm" variant={event.eventType === 'repair' || event.eventType === 'emergency' ? 'info' : event.eventType === 'preventive' ? 'success' : 'neutral'}>
                      {event.eventType}
                    </Badge>
                  </td>
                  <td>{event.description ?? '—'}</td>
                  <td>{event.durationHours === null ? '—' : `${event.durationHours} h`}</td>
                  <td className="fs-capitalize">{event.outcome?.replaceAll('_', ' ') ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

function Dependencies({ machine }) {
  const { state } = useFactoryData()
  const { openMachine } = useAppState()
  const upstream = upstreamOf(state, machine.id)
  const downstream = downstreamOf(state, machine.id)
  const chain = transitiveDownstream(state, machine.id)
  const backups = backupsOf(state, machine.id)
  const link = ({ machine: m, dependency }) => (
    <button key={m.id} type="button" className="fs-mi__deplink" onClick={() => openMachine(m.id)}>
      <span className="fs-mi__deplink-text">
        <strong>{m.code}</strong> {m.name}
        {dependency.notes ? <em>{dependency.notes}</em> : null}
      </span>
      <Icon name="chevronRight" size={14} />
    </button>
  )
  return (
    <div className="fs-mi__stack">
      <div className="fs-mi__deps">
        <Card title="Depends on" description="Machines that feed this one" padding="sm">
          {upstream.length ? upstream.map(link) : <p className="fs-muted">Start of its line — no upstream machines.</p>}
        </Card>
        <Card title="Feeds" description={chain.length > downstream.length ? `Directly; ${chain.length} machines downstream in total` : 'Machines that stop without its output'} padding="sm">
          {downstream.length ? downstream.map(link) : <p className="fs-muted">End of its line — no downstream machines.</p>}
        </Card>
        <Card title="Backup relationships" description="Machines that can take over work" padding="sm">
          {backups.length ? backups.map(link) : <p className="fs-muted">No backup machine on record.</p>}
        </Card>
      </div>
      <Card title="Impact path" description={`How ${machine.code} reaches lines, orders and deadlines`} padding="sm">
        <Suspense fallback={<div className="fs-mi__stage-loading"><Spinner /></div>}>
          <ImpactGraph height={560} focusMachineId={machine.id} onSelectMachine={(id) => id !== machine.id && openMachine(id)} />
        </Suspense>
      </Card>
    </div>
  )
}

export default function MachineIntelligence() {
  const { state, view } = useFactoryData()
  const { selectedMachineId, selectMachine, navigate, requestScenario, showOnFloor } = useAppState()
  const [tab, setTab] = useState('overview')
  const machineId = selectedMachineId ?? view.risks[0]?.machineId
  const machine = state.machines.find((m) => m.id === machineId)
  if (!machine) return null
  const risk = view.riskById.get(machine.id)

  return (
    <div className="fs-page fs-page--wide fs-mi">
      <MachinePicker activeId={machine.id} onPick={selectMachine} />
      <div className="fs-mi__main">
        <button type="button" className="fs-mi__back" onClick={() => navigate('command-center')}>
          <Icon name="arrowLeft" size={14} /> Command Center
        </button>
        <div className="fs-mi__header">
          <div className="fs-mi__title">
            <h2>{machine.code}</h2>
            <span>
              {machine.name} · {machine.machineType}
            </span>
          </div>
          <Badge variant={stateTone(machine.baselineState)} dot>
            {STATE_LABEL[machine.baselineState]}
          </Badge>
          <Badge variant={riskTone(risk.level)}>{risk.level} risk</Badge>
          <div className="fs-mi__actions">
            <Button variant="secondary" size="sm" icon={<Icon name="cube" size={14} />} onClick={() => showOnFloor(machine.id)}>
              Show on floor
            </Button>
            <Button variant="primary" size="sm" icon={<Icon name="flask" size={14} />} onClick={() => requestScenario({ kind: 'failure', machineId: machine.id })}>
              Simulate failure
            </Button>
          </div>
        </div>
        <Tabs tabs={TABS} activeId={tab} onChange={setTab} />
        <div className="fs-mi__panel" key={`${machine.id}-${tab}`}>
          {tab === 'overview' ? <Overview machine={machine} /> : null}
          {tab === 'risk' ? <HealthRisk machine={machine} /> : null}
          {tab === 'history' ? <History machine={machine} /> : null}
          {tab === 'maintenance' ? <Maintenance machine={machine} /> : null}
          {tab === 'dependencies' ? <Dependencies machine={machine} /> : null}
        </div>
      </div>
    </div>
  )
}
