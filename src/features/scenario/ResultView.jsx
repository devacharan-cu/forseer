import { lazy, Suspense, useMemo, useState } from 'react'
import { explainScenario } from '../../ai/index.js'
import Badge from '../../components/ui/Badge.jsx'
import Button from '../../components/ui/Button.jsx'
import Card from '../../components/ui/Card.jsx'
import Icon from '../../components/ui/Icon.jsx'
import SegmentedControl from '../../components/ui/SegmentedControl.jsx'
import Select, { NumberField } from '../../components/ui/Select.jsx'
import Spinner from '../../components/ui/Spinner.jsx'
import { findBreakingPoint } from '../../engine/index.js'
import { useAppState } from '../../state/AppStateContext.jsx'
import { useFactoryData } from '../../state/FactoryDataContext.jsx'
import AiPanel from '../ai/AiPanel.jsx'
import { deadlineTone, formatDate } from '../factory/model.js'
import { breakingPointParameter } from './scenarioBuilders.js'
import { CONDITION_LABEL, formatHours, formatMagnitude, IMPACT_LABEL, METRIC_DEFS, STATE_COLORS, STEP_LABEL } from './scenarioFormat.js'

const ImpactGraph = lazy(() => import('../impact/ImpactGraph.jsx'))

export function MetricGrid({ metrics, compact = false }) {
  const defs = compact ? METRIC_DEFS.slice(0, 6) : METRIC_DEFS
  return (
    <div className={`fs-sl-metrics ${compact ? 'fs-sl-metrics--compact' : ''}`}>
      {defs.map((def) => {
        const value = metrics[def.key]
        const baseline = def.baseline ? metrics[def.baseline] : null
        const worse = baseline !== null ? value > baseline : value > 0
        return (
          <div key={def.key} className={`fs-sl-metric ${worse && def.key !== 'machinesAffected' && def.key !== 'linesAffected' && def.key !== 'ordersAffected' ? 'is-worse' : ''}`}>
            <span className="fs-sl-metric__label">{def.label}</span>
            <strong className="fs-sl-metric__value">
              {value}
              {def.unit ? <small> {def.unit}</small> : null}
            </strong>
            <span className="fs-sl-metric__hint">{baseline !== null ? `baseline ${baseline}` : (def.hint ?? '')}</span>
          </div>
        )
      })}
    </div>
  )
}

// State of every affected machine over time, straight from the engine's stateTimeline.
function StateTimeline({ result }) {
  const machines = result.machineImpacts
  const lastChange = Math.max(
    24,
    ...machines.flatMap((m) => m.stateTimeline.slice(0, -1).map((segment) => segment.toHours)),
  )
  const window = Math.min(result.horizonHours, Math.ceil((lastChange * 1.5) / 12) * 12)
  const pct = (h) => `${(Math.min(h, window) / window) * 100}%`
  const ticks = []
  const tickStep = window <= 48 ? 6 : window <= 120 ? 12 : 24
  for (let h = 0; h <= window; h += tickStep) ticks.push(h)

  if (machines.length === 0) return <p className="fs-muted">No machine changes state in this future.</p>
  return (
    <div className="fs-sl-gantt">
      {machines.map((m) => (
        <div key={m.machineId} className="fs-sl-gantt__row">
          <span className="fs-sl-gantt__code">{m.code}</span>
          <div className="fs-sl-gantt__track">
            {m.stateTimeline
              .filter((segment) => segment.fromHours < window)
              .map((segment) => (
                <span
                  key={`${segment.fromHours}-${segment.state}`}
                  className={`fs-sl-gantt__seg fs-sl-gantt__seg--${STATE_COLORS[segment.state] ?? 'neutral'}`}
                  style={{ left: pct(segment.fromHours), width: `calc(${pct(segment.toHours)} - ${pct(segment.fromHours)})` }}
                  title={`${m.code} ${segment.state} ${segment.fromHours}–${segment.toHours} h`}
                >
                  {segment.state !== 'healthy' && segment.state !== 'monitoring' ? segment.state.replace('_', ' ') : ''}
                </span>
              ))}
            {m.upstreamLimitedHours > 0 ? <em className="fs-sl-gantt__note">starved {m.upstreamLimitedHours} h by {m.limitedByMachineCodes.join(', ')}</em> : null}
          </div>
          <span className="fs-sl-gantt__stat">
            {m.downtimeHours > 0 ? `${m.downtimeHours} h down` : m.scenarioPeakUtilization != null ? `peak ${Math.round(m.scenarioPeakUtilization * 100)}%` : ''}
          </span>
        </div>
      ))}
      <div className="fs-sl-gantt__axis">
        {ticks.map((h) => (
          <span key={h} style={{ left: pct(h) }}>
            +{h} h
          </span>
        ))}
      </div>
    </div>
  )
}

function CascadeList({ cascade }) {
  const steps = STEP_LABEL.map((label, step) => ({ label, step, entries: cascade.filter((entry) => entry.step === step) })).filter((s) => s.entries.length)
  if (steps.length === 0) return <p className="fs-muted">The engine found no cascade for this future.</p>
  return (
    <ol className="fs-sl-cascade">
      {steps.map((s) => (
        <li key={s.step}>
          <span className="fs-sl-cascade__step">
            {s.step}
            <em>{s.label}</em>
          </span>
          <ul>
            {s.entries.map((entry) => (
              <li key={`${entry.sourceId}-${entry.targetId}-${entry.impactType}`}>
                <span className="fs-sl-cascade__from">{entry.sourceLabel}</span>
                <Icon name="arrowRight" size={12} />
                <strong>{entry.targetLabel}</strong>
                <span className={`fs-sl-cascade__type fs-sl-cascade__type--${entry.impactType}`}>{IMPACT_LABEL[entry.impactType] ?? entry.impactType}</span>
                <span className="fs-sl-cascade__mag">{formatMagnitude(entry)}</span>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  )
}

function OrdersTable({ result }) {
  const [showAll, setShowAll] = useState(false)
  const rows = showAll ? result.orderImpacts : result.orderImpacts.filter((o) => o.affected)
  return (
    <>
      <div className="fs-sl-tablebar">
        <span className="fs-muted">
          {result.orderImpacts.filter((o) => o.affected).length} of {result.orderImpacts.length} open orders change
        </span>
        <Button size="sm" variant="ghost" onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Only changed orders' : 'Show all orders'}
        </Button>
      </div>
      <div className="fs-table-wrap">
        <table className="fs-table fs-table--static">
          <thead>
            <tr>
              <th>Order</th>
              <th>Line</th>
              <th>Deadline</th>
              <th>Status</th>
              <th>Completion</th>
              <th>Delay</th>
              <th>Slack</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="fs-muted">
                  No order changes in this future.
                </td>
              </tr>
            ) : null}
            {rows.map((o) => (
              <tr key={o.orderId}>
                <td>
                  <strong>{o.orderNumber}</strong> <span className="fs-muted fs-capitalize">{o.priority}</span>
                </td>
                <td>{o.lineCode}</td>
                <td className="fs-nowrap">
                  {formatDate(o.scenario.deadline, { withTime: true })}
                  {o.scenario.deadline !== o.baseline.deadline ? <span className="fs-muted"> (was {formatDate(o.baseline.deadline)})</span> : null}
                </td>
                <td className="fs-nowrap">
                  {o.statusChanged ? (
                    <>
                      <Badge size="sm" variant={deadlineTone(o.baseline.status)}>
                        {o.baseline.status}
                      </Badge>
                      <Icon name="arrowRight" size={12} className="fs-sl-arrow" />
                    </>
                  ) : null}
                  <Badge size="sm" variant={deadlineTone(o.scenario.status)}>
                    {o.scenario.status}
                  </Badge>
                </td>
                <td className="fs-nowrap">{o.scenario.canComplete ? formatDate(o.scenario.completionAt, { withTime: true }) : 'not within horizon'}</td>
                <td className={o.delayHours > 0 ? 'fs-text-danger' : o.delayHours < 0 ? 'fs-text-success' : ''}>{o.delayHours === null ? '—' : o.delayHours === 0 ? '—' : `${o.delayHours > 0 ? '+' : ''}${o.delayHours} h`}</td>
                <td className="fs-nowrap">
                  {formatHours(o.baseline.slackHours)} → <strong>{formatHours(o.scenario.slackHours)}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function LinesTable({ result }) {
  if (result.lineImpacts.length === 0) return <p className="fs-muted">No production line changes capacity.</p>
  return (
    <div className="fs-table-wrap">
      <table className="fs-table fs-table--static">
        <thead>
          <tr>
            <th>Line</th>
            <th>Nominal</th>
            <th>Lowest capacity</th>
            <th>Below baseline</th>
            <th>Lost</th>
          </tr>
        </thead>
        <tbody>
          {result.lineImpacts.map((l) => (
            <tr key={l.productionLineId}>
              <td>
                <strong>{l.code}</strong> <span className="fs-muted">{l.name}</span>
              </td>
              <td>{l.nominalCapacityPerHour}/h</td>
              <td>
                {l.minCapacityPerHour}/h <span className="fs-muted">({Math.round(l.minCapacityRatio * 100)}%)</span>
              </td>
              <td>{l.hoursBelowBaseline} h</td>
              <td className={l.lostProductionLineHours > 0 ? 'fs-text-danger' : 'fs-text-success'}>{l.lostProductionLineHours} line-h</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Risks({ result }) {
  const { resourceImpacts, breakingPoints, warnings } = result
  if (!resourceImpacts.length && !breakingPoints.length && !warnings.length) {
    return <p className="fs-muted">No secondary risks, hard limits or engine warnings in this future.</p>
  }
  return (
    <ul className="fs-sl-risks">
      {breakingPoints.map((bp) => (
        <li key={`${bp.entityId}-${bp.condition}`} className="fs-sl-risks__item fs-sl-risks__item--danger">
          <Icon name="alertTriangle" size={15} />
          <span>
            <strong>{bp.label}</strong> {CONDITION_LABEL[bp.condition] ?? bp.condition} at +{bp.atHours} h
          </span>
        </li>
      ))}
      {resourceImpacts.map((r) => (
        <li key={r.machineId} className="fs-sl-risks__item fs-sl-risks__item--warning">
          <Icon name="activity" size={15} />
          <span>
            <strong>{r.code}</strong> {r.riskType === 'overload' ? 'overloaded' : 'at high utilization'}: {Math.round(r.baselinePeakUtilization * 100)}% → {Math.round(r.scenarioPeakUtilization * 100)}% peak
            {r.coveringForCodes.length ? `, covering for ${r.coveringForCodes.join(', ')}` : ''} ({r.hoursAtOrAboveThreshold} h at or above {Math.round(r.utilizationThreshold * 100)}%)
          </span>
        </li>
      ))}
      {warnings.map((w) => (
        <li key={`${w.code}-${w.entityId}`} className="fs-sl-risks__item">
          <Icon name="info" size={15} />
          <span>{w.message}</span>
        </li>
      ))}
    </ul>
  )
}

function BreakingPointPanel({ run }) {
  const { state } = useFactoryData()
  const { scenario, result } = run
  const candidates = useMemo(
    () =>
      result.orderImpacts
        .filter((o) => o.baseline.status !== 'BREACHED')
        .sort((a, b) => Number(b.affected) - Number(a.affected) || (a.baseline.slackHours ?? Infinity) - (b.baseline.slackHours ?? Infinity)),
    [result],
  )
  const [target, setTarget] = useState(candidates.find((o) => o.affected)?.orderId ?? 'any')
  const [max, setMax] = useState('72')
  const [outcome, setOutcome] = useState(null)
  const param = breakingPointParameter(scenario, { orderId: target === 'any' ? null : target, max: Number(max) })
  if (!param) {
    return <p className="fs-muted">Breaking-point search needs a downtime event in the scenario (failure, planned downtime or degradation).</p>
  }
  const event = scenario.machineEvents[param.eventIndex]
  const machineCode = state.machines.find((m) => m.id === event.machineId)?.code

  function search() {
    try {
      setOutcome({ ok: true, value: findBreakingPoint(state, scenario, param) })
    } catch (error) {
      setOutcome({ ok: false, error })
    }
  }

  const bp = outcome?.ok ? outcome.value : null
  return (
    <div className="fs-sl-bp">
      <p className="fs-muted">
        How long can {machineCode} be {event.state === 'degraded' ? 'degraded' : 'down'} (starting +{event.startHours ?? 0} h) before the condition happens? The engine re-runs this scenario at
        different durations.
      </p>
      <div className="fs-sl-bp__form">
        <Select
          id="fs-bp-target"
          label="Condition"
          value={target}
          onChange={(v) => {
            setTarget(v)
            setOutcome(null)
          }}
          options={[{ value: 'any', label: 'Any new deadline breach' }, ...candidates.map((o) => ({ value: o.orderId, label: `${o.orderNumber} breaches (${o.lineCode}, ${o.baseline.slackHours} h slack now)` }))]}
        />
        <NumberField id="fs-bp-max" label="Search up to" value={max} onChange={setMax} min={1} max={672} step={1} suffix="h" />
        <Button variant="primary" size="sm" icon={<Icon name="target" size={14} />} onClick={search}>
          Find breaking point
        </Button>
      </div>
      {outcome && !outcome.ok ? <div className="fs-sl-error">{outcome.error.message}</div> : null}
      {bp ? (
        bp.found ? (
          <div className="fs-sl-bp__result">
            <span className="fs-sl-bp__value">{bp.breakingPoint} h</span>
            <div>
              <strong>
                {bp.affectedEntity === 'any_open_order' ? 'A new deadline breach' : `${bp.affectedEntity} breaches`} once {bp.machineCode} is down for {bp.breakingPoint} h
              </strong>
              <p className="fs-muted">
                Still safe at {bp.lastSafeValue} h
                {bp.observedAtLastSafeValue?.status ? ` (${bp.observedAtLastSafeValue.status}, ${bp.observedAtLastSafeValue.slackHours} h slack)` : ''}
                {bp.observedAtBreakingPoint?.status ? `; ${bp.observedAtBreakingPoint.status} with ${bp.observedAtBreakingPoint.slackHours} h slack at ${bp.breakingPoint} h` : ''}. Grid {bp.precision} h, {bp.evaluations} simulations.
              </p>
            </div>
          </div>
        ) : (
          <div className="fs-sl-bp__result fs-sl-bp__result--none">
            <Icon name={bp.reason === 'unsafe_at_minimum' ? 'alertTriangle' : 'check'} size={18} />
            <p>
              {bp.reason === 'unsafe_at_minimum'
                ? 'The condition already holds without this downtime event, so there is no breaking point to find.'
                : `No breaking point up to ${bp.searchedRange.max} h of downtime (${bp.evaluations} simulations).`}
            </p>
          </div>
        )
      ) : null}
    </div>
  )
}

export default function ResultView({ run, onRemove }) {
  const { state } = useFactoryData()
  const { openMachine } = useAppState()
  const [section, setSection] = useState('graph')
  const { scenario, result } = run

  return (
    <div className="fs-sl-result">
      <div className="fs-sl-result__head">
        <div>
          <h3>{result.scenarioName}</h3>
          {result.description ? <p className="fs-muted">{result.description}</p> : null}
          <p className="fs-sl-result__summary">
            <Icon name="cpu" size={13} /> {result.summary}
          </p>
        </div>
        <Button variant="ghost" size="sm" icon={<Icon name="trash" size={14} />} onClick={onRemove}>
          Remove
        </Button>
      </div>

      <MetricGrid metrics={result.metrics} />

      <Card
        padding="sm"
        title="Cascade"
        description="How the trigger travels through machines, lines, orders and deadlines"
        actions={
          <SegmentedControl
            size="sm"
            label="Cascade view"
            value={section}
            onChange={setSection}
            options={[
              { value: 'graph', label: 'Graph', icon: <Icon name="graph" size={13} /> },
              { value: 'steps', label: 'Steps', icon: <Icon name="list" size={13} /> },
            ]}
          />
        }
      >
        {section === 'graph' ? (
          <Suspense fallback={<div className="fs-sl-loading"><Spinner /></div>}>
            <ImpactGraph height={520} result={result} onSelectMachine={(id) => id && openMachine(id)} />
          </Suspense>
        ) : (
          <CascadeList cascade={result.cascade} />
        )}
      </Card>

      <Card padding="sm" title="Machine timeline" description="Engine state of each affected machine over the coming hours">
        <StateTimeline result={result} />
      </Card>

      <Card padding="sm" title="Order consequences" description="Projected completion and deadline status against the current plan with no scenario applied">
        <OrdersTable result={result} />
      </Card>

      <div className="fs-sl-two">
        <Card padding="sm" title="Production lines">
          <LinesTable result={result} />
        </Card>
        <Card padding="sm" title="Secondary risks and hard limits">
          <Risks result={result} />
        </Card>
      </div>

      <Card padding="sm" title="Breaking point" description="The smallest downtime at which a condition first happens">
        <BreakingPointPanel key={run.id} run={run} />
      </Card>

      <AiPanel
        key={`ai-${run.id}`}
        title="AI scenario explanation"
        description="The causal chain and trade-offs in plain language, grounded in this result"
        run={(provider) => explainScenario({ provider, factoryState: state, results: result })}
        render={(explanation) => <ExplanationBody explanation={explanation} />}
      />

      <details className="fs-sl-assumptions">
        <summary>Assumptions the engine used</summary>
        <pre>{JSON.stringify({ machineEvents: scenario.machineEvents, actions: result.assumptions.actions, deadlineThresholds: result.assumptions.deadlineThresholds, operatingHoursPerDay: result.assumptions.operatingHoursPerDay, horizonHours: result.horizonHours }, null, 2)}</pre>
      </details>
    </div>
  )
}

export function ExplanationBody({ explanation }) {
  return (
    <>
      <p>
        <strong>{explanation.headline}</strong>
      </p>
      <p>{explanation.explanation}</p>
      {explanation.causalChain.length ? (
        <>
          <h4>Causal chain</h4>
          <ol className="fs-sl-ol">
            {explanation.causalChain.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </>
      ) : null}
      {explanation.keyImpacts.length ? (
        <>
          <h4>Key impacts</h4>
          <ul>
            {explanation.keyImpacts.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </>
      ) : null}
      {explanation.tradeoffs.length ? (
        <>
          <h4>Trade-offs</h4>
          <ul>
            {explanation.tradeoffs.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </>
      ) : null}
      {explanation.warnings.length ? (
        <>
          <h4>Warnings</h4>
          <ul>
            {explanation.warnings.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </>
      ) : null}
    </>
  )
}
