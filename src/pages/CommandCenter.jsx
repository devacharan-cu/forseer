import { lazy, Suspense, useMemo } from 'react'
import Badge from '../components/ui/Badge.jsx'
import Button from '../components/ui/Button.jsx'
import Card from '../components/ui/Card.jsx'
import Icon from '../components/ui/Icon.jsx'
import ProgressBar from '../components/ui/ProgressBar.jsx'
import SegmentedControl from '../components/ui/SegmentedControl.jsx'
import Spinner from '../components/ui/Spinner.jsx'
import {
  deadlineTone,
  exposureOf,
  formatDate,
  formatDaysAgo,
  formatRelativeHours,
  hoursUntil,
  incidentsFor,
  linesForMachine,
  machinesOnLine,
  openIncidents,
  openOrders,
  RISK_ORDER,
  riskTone,
  serviceStatus,
  STATE_LABEL,
  stateTone,
} from '../features/factory/model.js'
import { useAppState } from '../state/AppStateContext.jsx'
import { useFactoryData } from '../state/FactoryDataContext.jsx'
import './CommandCenter.css'

const FactoryView = lazy(() => import('../features/factory3d/FactoryView.jsx'))
const ImpactGraph = lazy(() => import('../features/impact/ImpactGraph.jsx'))

const FLOOR_VIEWS = [
  { value: '3d', label: '3D view', icon: <Icon name="cube" size={14} /> },
  { value: 'graph', label: 'Impact graph', icon: <Icon name="graph" size={14} /> },
  { value: 'list', label: 'List', icon: <Icon name="list" size={14} /> },
]

function countBy(items, key) {
  const counts = new Map()
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1)
  return counts
}

function Kpi({ icon, label, value, children, tone }) {
  return (
    <div className={`fs-kpi ${tone ? `fs-kpi--${tone}` : ''}`}>
      <div className="fs-kpi__head">
        <span className="fs-kpi__icon">
          <Icon name={icon} size={16} />
        </span>
        <span className="fs-kpi__label">{label}</span>
      </div>
      <div className="fs-kpi__body">
        <span className="fs-kpi__value">{value}</span>
        <div className="fs-kpi__detail">{children}</div>
      </div>
    </div>
  )
}

function Breakdown({ rows }) {
  return (
    <ul className="fs-breakdown">
      {rows
        .filter((row) => row.count > 0 || row.always)
        .map((row) => (
          <li key={row.label}>
            <span className={`fs-breakdown__dot fs-breakdown__dot--${row.tone}`} />
            <span>{row.label}</span>
            <strong>{row.count}</strong>
          </li>
        ))}
    </ul>
  )
}

function KpiStrip() {
  const { state, view } = useFactoryData()
  const byState = countBy(state.machines, (m) => m.baselineState)
  const orders = openOrders(state)
  const byStatus = countBy(orders, (o) => view.orderOutlookById.get(o.id)?.baseline.status ?? 'SAFE')
  const incidents = openIncidents(state)
  const bySeverity = countBy(incidents, (i) => i.severity)
  const top = view.risks[0]
  const elevated = view.risks.filter((r) => r.level === 'HIGH' || r.level === 'CRITICAL')

  return (
    <div className="fs-kpis">
      <Kpi icon="cpu" label="Machines" value={state.machines.length}>
        <Breakdown
          rows={['healthy', 'monitoring', 'at_risk', 'degraded', 'failed', 'maintenance'].map((s) => ({
            label: STATE_LABEL[s],
            count: byState.get(s) ?? 0,
            tone: stateTone(s),
          }))}
        />
      </Kpi>
      <Kpi icon="layers" label="Production lines" value={state.productionLines.length}>
        <ul className="fs-kpi__lines">
          {view.capacity.productionLines.map((line) => (
            <li key={line.productionLineId}>
              <span>{line.code}</span>
              <ProgressBar value={line.capacityRatio} tone={line.capacityRatio < 0.999 ? 'warning' : 'success'} label={`${line.code} capacity`} />
              <strong>{Math.round(line.capacityRatio * 100)}%</strong>
            </li>
          ))}
        </ul>
      </Kpi>
      <Kpi icon="package" label="Open orders" value={orders.length}>
        <Breakdown
          rows={['SAFE', 'WARNING', 'CRITICAL', 'BREACHED'].map((s) => ({
            label: s === 'SAFE' ? 'On track' : s.charAt(0) + s.slice(1).toLowerCase(),
            count: byStatus.get(s) ?? 0,
            tone: deadlineTone(s),
            always: true,
          }))}
        />
      </Kpi>
      <Kpi icon="alertTriangle" label="Open incidents" value={incidents.length} tone={incidents.length ? 'warning' : undefined}>
        <Breakdown
          rows={['critical', 'high', 'medium', 'low'].map((s) => ({
            label: s.charAt(0).toUpperCase() + s.slice(1),
            count: bySeverity.get(s) ?? 0,
            tone: s === 'critical' || s === 'high' ? 'danger' : s === 'medium' ? 'warning' : 'neutral',
          }))}
        />
        {incidents.length === 0 ? <span className="fs-kpi__note">No open incidents</span> : null}
      </Kpi>
      <Kpi icon="shield" label="Operational risk" value={top?.level ?? '—'} tone={riskTone(top?.level)}>
        <span className="fs-kpi__note">
          {elevated.length} machine{elevated.length === 1 ? '' : 's'} at HIGH or above
        </span>
        <span className="fs-kpi__note">Highest: {top ? `${top.code} (${top.points} pts)` : '—'}</span>
      </Kpi>
    </div>
  )
}

function CriticalAlert() {
  const { state, view } = useFactoryData()
  const { openMachine, requestScenario, showOnFloor } = useAppState()
  const top = view.risks[0]
  if (!top || RISK_ORDER.indexOf(top.level) < RISK_ORDER.indexOf('MODERATE')) {
    return (
      <Card title="No elevated risk" description="Every machine is classified LOW operational risk by the engine." padding="sm">
        <Badge variant="success" dot>
          All clear
        </Badge>
      </Card>
    )
  }
  const machine = state.machines.find((m) => m.id === top.machineId)
  const openIncident = incidentsFor(state, machine.id).find((i) => i.status === 'open' || i.status === 'investigating')
  const exposure = exposureOf(state, view, machine.id)
  const notSafe = exposure.orders.filter((o) => o.outlook && o.outlook.baseline.status !== 'SAFE')
  const tone = riskTone(top.level)

  return (
    <div className={`fs-alert fs-alert--${tone}`}>
      <div className="fs-alert__head">
        <span className="fs-alert__icon">
          <Icon name="alertTriangle" size={18} />
        </span>
        <div>
          <div className="fs-alert__eyebrow">Highest operational risk</div>
          <div className="fs-alert__title">
            {machine.code} — {machine.name}
          </div>
        </div>
        <Badge variant={tone}>{top.level}</Badge>
      </div>
      <ul className="fs-alert__signals">
        {top.signals.map((signal) => (
          <li key={signal.signal}>
            <span>{signal.signal.replaceAll('_', ' ')}</span>
            <strong>+{signal.points}</strong>
          </li>
        ))}
      </ul>
      {openIncident ? <p className="fs-alert__incident">“{openIncident.description}” — {formatDaysAgo(openIncident.detectedAt, state.asOf)}</p> : null}
      <p className="fs-alert__exposure">
        Feeds {exposure.downstream.map((m) => m.code).join(', ') || 'no other machines'} on {linesForMachine(state, machine.id).map((l) => l.code).join(', ')}.
        {notSafe.length ? ` ${notSafe.length} order${notSafe.length === 1 ? '' : 's'} on that line already not on track: ${notSafe.map((o) => o.order.orderNumber).join(', ')}.` : ''}
      </p>
      <p className="fs-alert__disclaimer">FORSEER operational risk points ({top.points}) — an internal classification, not a failure probability.</p>
      <div className="fs-alert__actions">
        <Button variant={tone === 'danger' ? 'danger' : 'primary'} size="sm" onClick={() => openMachine(machine.id)}>
          View details
        </Button>
        <Button variant="secondary" size="sm" icon={<Icon name="flask" size={14} />} onClick={() => requestScenario({ kind: 'failure', machineId: machine.id })}>
          Run what-if
        </Button>
        <Button variant="ghost" size="sm" icon={<Icon name="cube" size={14} />} onClick={() => showOnFloor(machine.id)}>
          Show on floor
        </Button>
      </div>
    </div>
  )
}

function AtRiskOrders() {
  const { state, view } = useFactoryData()
  const { focusOrder } = useAppState()
  const rows = openOrders(state)
    .map((order) => ({ order, impact: view.orderOutlookById.get(order.id) }))
    .filter((row) => row.impact)
    .sort((a, b) => (a.impact.baseline.slackHours ?? -Infinity) - (b.impact.baseline.slackHours ?? -Infinity))
    .slice(0, 6)
  const lineCode = (id) => state.productionLines.find((l) => l.id === id)?.code

  return (
    <Card title="Orders closest to their deadline" description="Engine projection of the current plan" padding="sm">
      <ul className="fs-orderlist">
        {rows.map(({ order, impact }) => (
          <li key={order.id}>
            <button type="button" onClick={() => focusOrder(order.id)}>
              <span className="fs-orderlist__num">{order.orderNumber}</span>
              <span className="fs-orderlist__line">{lineCode(order.productionLineId)}</span>
              <Badge size="sm" variant={deadlineTone(impact.baseline.status)}>
                {impact.baseline.status}
              </Badge>
              <span className="fs-orderlist__slack">
                {impact.baseline.slackHours === null ? 'cannot finish' : impact.baseline.slackHours < 0 ? `${Math.abs(impact.baseline.slackHours)} h late` : `${impact.baseline.slackHours} h slack`}
              </span>
              <span className="fs-orderlist__due">due {formatRelativeHours(hoursUntil(order.deadline, state.asOf))}</span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  )
}

const FEED_LIMIT = 6

function IncidentsFeed() {
  const { state } = useFactoryData()
  const { openMachine } = useAppState()
  const code = (id) => state.machines.find((m) => m.id === id)?.code
  const open = openIncidents(state)
  const services = state.machines
    .map((machine) => ({ machine, service: serviceStatus(state, machine) }))
    .filter(({ service }) => service.daysUntilDue !== null && service.daysUntilDue <= 7)
    .sort((a, b) => a.service.daysUntilDue - b.service.daysUntilDue)
  const recent = state.incidents
    .filter((i) => !open.includes(i) && hoursUntil(i.detectedAt, state.asOf) > -24 * 30)
    .sort((a, b) => Date.parse(b.detectedAt) - Date.parse(a.detectedAt))
    .slice(0, Math.max(0, FEED_LIMIT - open.length - services.length))

  return (
    <Card title="Incidents & maintenance" padding="sm">
      <ul className="fs-feed">
        {open.map((incident) => (
          <li key={incident.id}>
            <button type="button" onClick={() => openMachine(incident.machineId)}>
              <Badge size="sm" variant={incident.severity === 'high' || incident.severity === 'critical' ? 'danger' : 'warning'}>
                {incident.severity}
              </Badge>
              <span className="fs-feed__text">
                <strong>{code(incident.machineId)}</strong> {incident.description}
              </span>
              <span className="fs-feed__when">open · {formatDaysAgo(incident.detectedAt, state.asOf)}</span>
            </button>
          </li>
        ))}
        {services.map(({ machine, service }) => (
          <li key={`svc-${machine.id}`}>
            <button type="button" onClick={() => openMachine(machine.id)}>
              <Badge size="sm" variant={service.overdue ? 'danger' : 'warning'}>
                {service.overdue ? 'overdue' : 'service'}
              </Badge>
              <span className="fs-feed__text">
                <strong>{machine.code}</strong> {service.overdue ? `service overdue by ${Math.abs(service.daysUntilDue)} days` : `service due in ${service.daysUntilDue} days`} ({machine.maintenanceIntervalDays}-day interval)
              </span>
              <span className="fs-feed__when">last {formatDate(service.lastServiceAt)}</span>
            </button>
          </li>
        ))}
        {recent.map((incident) => (
          <li key={incident.id}>
            <button type="button" onClick={() => openMachine(incident.machineId)}>
              <Badge size="sm" variant="neutral">
                {incident.status}
              </Badge>
              <span className="fs-feed__text">
                <strong>{code(incident.machineId)}</strong> {incident.description}
              </span>
              <span className="fs-feed__when">{formatDaysAgo(incident.detectedAt, state.asOf)}</span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function LineCards() {
  const { state, view } = useFactoryData()
  const { selectMachine, setFloorView } = useAppState()
  return (
    <div className="fs-linecards">
      {state.productionLines.map((line) => {
        const capacity = view.capacityByLineId.get(line.id)
        const orders = openOrders(state).filter((o) => o.productionLineId === line.id)
        const statuses = countBy(orders, (o) => view.orderOutlookById.get(o.id)?.baseline.status ?? 'SAFE')
        const queued = orders.reduce((total, o) => total + o.requiredProductionHours, 0)
        const next = [...orders].sort((a, b) => Date.parse(a.deadline) - Date.parse(b.deadline)).find((o) => hoursUntil(o.deadline, state.asOf) > 0)
        return (
          <Card key={line.id} padding="sm" className="fs-linecard">
            <div className="fs-linecard__head">
              <div>
                <div className="fs-linecard__code">{line.code}</div>
                <div className="fs-linecard__name">{line.name.replace(/^Line \d+\s*—\s*/, '')}</div>
              </div>
              <div className="fs-linecard__capacity">
                <strong>
                  {capacity.currentCapacityPerHour}/{capacity.nominalCapacityPerHour}
                </strong>
                <span>units per h now</span>
              </div>
            </div>
            <div className="fs-linecard__machines">
              {machinesOnLine(state, line.id).map((m) => {
                const risk = view.riskById.get(m.id)
                return (
                  <button
                    key={m.id}
                    type="button"
                    className={`fs-chip fs-chip--${m.baselineState === 'failed' ? 'danger' : riskTone(risk.level)}`}
                    onClick={() => {
                      selectMachine(m.id)
                      setFloorView('3d')
                    }}
                  >
                    <span className="fs-chip__dot" />
                    {m.code}
                  </button>
                )
              })}
            </div>
            <dl className="fs-linecard__facts">
              <div>
                <dt>Open orders</dt>
                <dd>
                  {orders.length}
                  {['BREACHED', 'CRITICAL', 'WARNING'].map((s) =>
                    statuses.get(s) ? (
                      <Badge key={s} size="sm" variant={deadlineTone(s)}>
                        {statuses.get(s)} {s.toLowerCase()}
                      </Badge>
                    ) : null,
                  )}
                </dd>
              </div>
              <div>
                <dt>Queued work</dt>
                <dd>{queued} line-hours</dd>
              </div>
              <div>
                <dt>Next deadline</dt>
                <dd>{next ? `${next.orderNumber} ${formatRelativeHours(hoursUntil(next.deadline, state.asOf))}` : '—'}</dd>
              </div>
            </dl>
          </Card>
        )
      })}
    </div>
  )
}

function MachineList() {
  const { state, view } = useFactoryData()
  const { selectedMachineId, selectMachine, openMachine } = useAppState()
  const rows = useMemo(
    () =>
      [...state.machines].sort(
        (a, b) => view.risks.findIndex((r) => r.machineId === a.id) - view.risks.findIndex((r) => r.machineId === b.id),
      ),
    [state, view],
  )
  return (
    <div className="fs-table-wrap">
      <table className="fs-table">
        <thead>
          <tr>
            <th>Machine</th>
            <th>Type</th>
            <th>Line</th>
            <th>State</th>
            <th>Operational risk</th>
            <th>Load / usable</th>
            <th>Last service</th>
            <th>Open incidents</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((machine) => {
            const risk = view.riskById.get(machine.id)
            const capacity = view.capacityByMachineId.get(machine.id)
            const service = serviceStatus(state, machine)
            const incidents = openIncidents(state).filter((i) => i.machineId === machine.id).length
            return (
              <tr
                key={machine.id}
                className={selectedMachineId === machine.id ? 'is-selected' : ''}
                onClick={() => selectMachine(machine.id)}
                onDoubleClick={() => openMachine(machine.id)}
              >
                <td>
                  <strong>{machine.code}</strong> <span className="fs-muted">{machine.name}</span>
                </td>
                <td>{machine.machineType}</td>
                <td>{linesForMachine(state, machine.id).map((l) => l.code).join(', ')}</td>
                <td>
                  <Badge size="sm" variant={stateTone(machine.baselineState)} dot>
                    {STATE_LABEL[machine.baselineState]}
                  </Badge>
                </td>
                <td>
                  <Badge size="sm" variant={riskTone(risk.level)}>
                    {risk.level} · {risk.points}
                  </Badge>
                </td>
                <td>
                  {capacity.assignedLoadPerHour}/{capacity.usableCapacityPerHour} per h
                </td>
                <td className={service.overdue ? 'fs-text-danger' : ''}>{formatDaysAgo(service.lastServiceAt, state.asOf)}</td>
                <td>{incidents || '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function FloorPanel() {
  const { floorView, setFloorView, selectedMachineId, selectMachine, focusedOrderId, focusOrder, openMachine } = useAppState()
  const { state } = useFactoryData()
  return (
    <Card padding="sm" className="fs-floor">
      <div className="fs-floor__head">
        <div>
          <h3 className="fs-card__title">Factory floor — NOVA-01</h3>
          <p className="fs-card__description">
            {state.machines.length} machines on {state.productionLines.length} lines · select a machine to trace its impact
          </p>
        </div>
        <SegmentedControl options={FLOOR_VIEWS} value={floorView} onChange={setFloorView} label="Floor view" />
      </div>
      <Suspense
        fallback={
          <div className="fs-floor__loading">
            <Spinner /> Loading view…
          </div>
        }
      >
        {floorView === '3d' ? <FactoryView height={640} /> : null}
        {floorView === 'graph' ? (
          <ImpactGraph
            height={640}
            focusMachineId={selectedMachineId}
            focusOrderId={focusedOrderId}
            onSelectMachine={(id) => selectMachine(id === selectedMachineId ? null : id)}
            onSelectOrder={(id) => (id === focusedOrderId ? focusOrder(null) : focusOrder(id))}
            onClear={() => {
              selectMachine(null)
              if (focusedOrderId) focusOrder(null)
            }}
          />
        ) : null}
        {floorView === 'list' ? <MachineList /> : null}
      </Suspense>
      {floorView !== '3d' && selectedMachineId ? (
        <div className="fs-floor__selection">
          <span>
            Selected <strong>{state.machines.find((m) => m.id === selectedMachineId)?.code}</strong>
          </span>
          <Button size="sm" variant="primary" onClick={() => openMachine(selectedMachineId)}>
            Open intelligence
          </Button>
          <Button size="sm" variant="ghost" onClick={() => selectMachine(null)}>
            Clear
          </Button>
        </div>
      ) : null}
    </Card>
  )
}

export default function CommandCenter() {
  const { navigate } = useAppState()
  const { state, source } = useFactoryData()
  return (
    <div className="fs-page fs-page--wide fs-cc">
      <div className="fs-cc__header">
        <div>
          <h2 className="fs-page__title">Command Center</h2>
          <p className="fs-page__subtitle">
            Factory state, operational risk and production exposure · as of {formatDate(state.asOf, { withTime: true })}
            {source === 'seed' ? ' · seed snapshot' : ''}
          </p>
        </div>
        <div className="fs-cc__modes">
          <button type="button" className="fs-mode fs-mode--danger" onClick={() => navigate('before')}>
            <Icon name="shield" size={16} />
            <span>
              <strong>Before</strong>
              <small>Prevent failures</small>
            </span>
          </button>
          <button type="button" className="fs-mode fs-mode--accent" onClick={() => navigate('during')}>
            <Icon name="activity" size={16} />
            <span>
              <strong>During</strong>
              <small>Monitor & contain</small>
            </span>
          </button>
          <button type="button" className="fs-mode fs-mode--success" onClick={() => navigate('after')}>
            <Icon name="history" size={16} />
            <span>
              <strong>After</strong>
              <small>Recover & learn</small>
            </span>
          </button>
        </div>
      </div>

      <KpiStrip />

      <div className="fs-cc__grid">
        <FloorPanel />
        <div className="fs-cc__side">
          <CriticalAlert />
          <AtRiskOrders />
          <IncidentsFeed />
        </div>
      </div>

      <LineCards />
    </div>
  )
}
