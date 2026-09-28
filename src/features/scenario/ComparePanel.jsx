import { useMemo, useState } from 'react'
import { explainScenario } from '../../ai/index.js'
import Badge from '../../components/ui/Badge.jsx'
import Button from '../../components/ui/Button.jsx'
import Card from '../../components/ui/Card.jsx'
import Icon from '../../components/ui/Icon.jsx'
import Select, { NumberField } from '../../components/ui/Select.jsx'
import { compareScenarios } from '../../engine/index.js'
import { useFactoryData } from '../../state/FactoryDataContext.jsx'
import AiPanel from '../ai/AiPanel.jsx'
import { deadlineTone } from '../factory/model.js'
import { ExplanationBody } from './ResultView.jsx'
import { beforeComparisonSet, DEFAULT_COMPARE_FAILURE } from './scenarioBuilders.js'
import { METRIC_DEFS, METRIC_LABEL } from './scenarioFormat.js'

const UNIT = Object.fromEntries(METRIC_DEFS.map((d) => [d.key, d.unit ?? '']))

function PresetCard({ machineId, onRunSet }) {
  const { state, view } = useFactoryData()
  const [target, setTarget] = useState(machineId)
  const [start, setStart] = useState(String(DEFAULT_COMPARE_FAILURE.startHours))
  const [duration, setDuration] = useState(String(DEFAULT_COMPARE_FAILURE.durationHours))
  const failure = { startHours: Number(start), durationHours: Number(duration) }
  const valid = start.trim() !== '' && duration.trim() !== '' && failure.startHours >= 0 && failure.durationHours > 0
  const set = valid ? beforeComparisonSet(state, view, target, failure) : []

  return (
    <Card padding="sm" title="Prevent a failure — compare options" description="Leave the failure alone, or intervene before it happens. Each option states what it assumes.">
      <div className="fs-sl-preset">
        <Select
          id="fs-cmp-machine"
          label="Machine"
          value={target}
          onChange={setTarget}
          options={state.machines.map((m) => ({ value: m.id, label: `${m.code} · ${m.name} · ${view.riskById.get(m.id)?.level}` }))}
        />
        <NumberField id="fs-cmp-start" label="Failure starts in" value={start} onChange={setStart} min={0} step={1} suffix="h" />
        <NumberField id="fs-cmp-dur" label="Repair takes" value={duration} onChange={setDuration} min={0.5} step={0.5} suffix="h" />
      </div>
      <ol className="fs-sl-preset__list">
        {set.map((scenario) => (
          <li key={scenario.id}>
            <strong>{scenario.name}</strong>
            <span className="fs-muted">{scenario.description}</span>
          </li>
        ))}
      </ol>
      <Button variant="primary" icon={<Icon name="compare" size={14} />} disabled={set.length < 2} onClick={() => onRunSet(set)}>
        Simulate {set.length} options and compare
      </Button>
    </Card>
  )
}

function ComparisonTable({ runs, comparison }) {
  const nameOf = new Map(runs.map((r) => [r.result.scenarioId, r.result.scenarioName]))
  return (
    <div className="fs-table-wrap">
      <table className="fs-table fs-table--static fs-sl-cmp">
        <thead>
          <tr>
            <th>Metric</th>
            {comparison.scenarioIds.map((id, i) => (
              <th key={id}>
                {i === 0 ? <span className="fs-sl-cmp__ref">reference</span> : null}
                {nameOf.get(id)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {comparison.metrics.map((row) => (
            <tr key={row.metric}>
              <td>{METRIC_LABEL[row.metric] ?? row.metric}</td>
              {row.values.map((entry, i) => {
                const delta = row.deltasFromReference[i].delta
                const lowest = row.lowestValueScenarioIds.includes(entry.scenarioId) && row.lowestValueScenarioIds.length < row.values.length
                return (
                  <td key={entry.scenarioId} className={lowest ? 'fs-sl-cmp__low' : ''}>
                    <strong>
                      {entry.value}
                      {UNIT[row.metric] ? ` ${UNIT[row.metric]}` : ''}
                    </strong>
                    {i > 0 && delta !== 0 ? <span className={delta > 0 ? 'fs-text-danger' : 'fs-text-success'}> {delta > 0 ? `+${delta}` : delta}</span> : null}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function OrderMatrix({ runs, comparison }) {
  const nameOf = new Map(runs.map((r) => [r.result.scenarioId, r.result.scenarioName]))
  if (comparison.orders.length === 0) return <p className="fs-muted">Every order ends the same way in all selected futures.</p>
  return (
    <div className="fs-table-wrap">
      <table className="fs-table fs-table--static fs-sl-cmp">
        <thead>
          <tr>
            <th>Order</th>
            {comparison.scenarioIds.map((id) => (
              <th key={id}>{nameOf.get(id)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {comparison.orders.map((order) => (
            <tr key={order.orderId}>
              <td>
                <strong>{order.orderNumber}</strong>
              </td>
              {order.outcomes.map((o) => (
                <td key={o.scenarioId} className="fs-nowrap">
                  <Badge size="sm" variant={deadlineTone(o.status)}>
                    {o.status ?? '—'}
                  </Badge>{' '}
                  <span className="fs-muted">{o.slackHours === null ? 'no completion' : `${o.slackHours} h slack`}</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function ComparePanel({ machineId, runs, onRunSet, selectedIds, setSelectedIds }) {
  const { state } = useFactoryData()
  const chosen = useMemo(
    () => runs.filter((r) => selectedIds.includes(r.id)).sort((a, b) => a.seq - b.seq),
    [runs, selectedIds],
  )
  const outcome = useMemo(() => {
    if (chosen.length < 2) return null
    try {
      return { comparison: compareScenarios(chosen.map((r) => r.result)) }
    } catch (error) {
      return { error }
    }
  }, [chosen])

  const toggle = (id) => setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))

  return (
    <div className="fs-sl-compare">
      <PresetCard machineId={machineId} onRunSet={onRunSet} />

      <Card padding="sm" title="Compare futures" description="Pick two or more runs. The earliest selected run is the reference; the engine reports differences and does not rank them.">
        {runs.length < 2 ? (
          <p className="fs-muted">Run at least two scenarios (or use the option set above) to compare them.</p>
        ) : (
          <div className="fs-sl-pick">
            {[...runs].sort((a, b) => a.seq - b.seq).map((run) => (
              <button key={run.id} type="button" className={`fs-sl-pick__item ${selectedIds.includes(run.id) ? 'is-on' : ''}`} onClick={() => toggle(run.id)} aria-pressed={selectedIds.includes(run.id)}>
                <span className="fs-sl-pick__box">{selectedIds.includes(run.id) ? <Icon name="check" size={12} /> : null}</span>
                <span className="fs-sl-pick__seq">#{run.seq}</span>
                {run.result.scenarioName}
              </button>
            ))}
          </div>
        )}
        {outcome?.error ? <div className="fs-sl-error">{outcome.error.message}</div> : null}
        {outcome?.comparison ? (
          <>
            <ComparisonTable runs={chosen} comparison={outcome.comparison} />
            <p className="fs-sl-cmp__note">
              <Icon name="info" size={13} /> {outcome.comparison.note} Highlighted cells hold the lowest value.
            </p>
          </>
        ) : null}
      </Card>

      {outcome?.comparison ? (
        <>
          <Card padding="sm" title="Where the order outcomes differ" description="Deadline status and slack per future">
            <OrderMatrix runs={chosen} comparison={outcome.comparison} />
          </Card>
          <AiPanel
            key={outcome.comparison.scenarioIds.join('|')}
            title="AI comparison"
            description="Weighs the trade-offs between these futures using only the engine's figures"
            actionLabel="Explain the trade-offs"
            run={(provider) => explainScenario({ provider, factoryState: state, results: chosen.map((r) => r.result), comparison: outcome.comparison })}
            render={(explanation) => <ExplanationBody explanation={explanation} />}
          />
        </>
      ) : null}
    </div>
  )
}
