import { useCallback, useEffect, useMemo, useState } from 'react'
import Badge from '../components/ui/Badge.jsx'
import Card from '../components/ui/Card.jsx'
import Icon from '../components/ui/Icon.jsx'
import Select, { NumberField } from '../components/ui/Select.jsx'
import Tabs from '../components/ui/Tabs.jsx'
import { simulateScenario } from '../engine/index.js'
import { riskTone } from '../features/factory/model.js'
import ComparePanel from '../features/scenario/ComparePanel.jsx'
import CustomBuilder from '../features/scenario/CustomBuilder.jsx'
import ResultView from '../features/scenario/ResultView.jsx'
import ScenarioPreview from '../features/scenario/ScenarioPreview.jsx'
import {
  blankEvent,
  buildEventScenario,
  DEFAULT_FAILURE_HOURS,
  DEFAULT_LOAD_FRACTION,
  EVENT_TYPES,
  lastPreventiveHours,
  quickScenarios,
  scenarioFromDraft,
  withRunId,
} from '../features/scenario/scenarioBuilders.js'
import { useAppState } from '../state/AppStateContext.jsx'
import { useFactoryData } from '../state/FactoryDataContext.jsx'
import './ScenarioLab.css'

const TABS = [
  { id: 'quick', label: 'Quick scenarios' },
  { id: 'custom', label: 'Custom scenario' },
  { id: 'compare', label: 'Compare' },
  { id: 'results', label: 'Results' },
]

function tryPreview(state, scenario) {
  if (!scenario) return null
  try {
    return { result: simulateScenario(state, scenario) }
  } catch (error) {
    return { error }
  }
}

function QuickTab({ machineId, setMachineId, onRun }) {
  const { state, view } = useFactoryData()
  const cards = useMemo(() => quickScenarios(state, view, machineId), [state, view, machineId])
  const [picked, setPicked] = useState({ source: 'card', key: cards[0]?.key })
  const [form, setForm] = useState({ eventType: 'failed', startHours: '0', durationHours: String(DEFAULT_FAILURE_HOURS), capacityFactor: '0.6', fraction: String(DEFAULT_LOAD_FRACTION) })

  const formScenario = useMemo(() => {
    const n = (v) => (String(v).trim() === '' ? NaN : Number(v))
    return buildEventScenario(state, { machineId, eventType: form.eventType, startHours: n(form.startHours), durationHours: n(form.durationHours), capacityFactor: n(form.capacityFactor), fraction: n(form.fraction) })
  }, [state, machineId, form])
  const scenario = picked.source === 'form' ? formScenario : (cards.find((c) => c.key === picked.key) ?? cards[0])?.scenario
  const preview = useMemo(() => tryPreview(state, scenario), [state, scenario])
  const setField = (patch) => {
    setForm((f) => ({ ...f, ...patch }))
    setPicked({ source: 'form' })
  }
  const pmHint = lastPreventiveHours(state, machineId)
  const machine = state.machines.find((m) => m.id === machineId)

  return (
    <div className="fs-sl-quick">
      <div className="fs-sl-quick__main">
        <Card padding="sm">
          <div className="fs-sl-target">
            <Select
              id="fs-sl-machine"
              label="Machine"
              value={machineId}
              onChange={(id) => {
                setMachineId(id)
                setPicked({ source: 'card', key: 'failure' })
              }}
              options={state.machines.map((m) => ({ value: m.id, label: `${m.code} · ${m.name}` }))}
            />
            <div className="fs-sl-target__facts">
              <Badge variant={riskTone(view.riskById.get(machineId)?.level)}>{view.riskById.get(machineId)?.level} risk</Badge>
              <span className="fs-muted">
                {machine?.machineType} · {view.capacityByMachineId.get(machineId)?.assignedLoadPerHour}/h assigned of {view.capacityByMachineId.get(machineId)?.usableCapacityPerHour}/h usable
              </span>
            </div>
          </div>
        </Card>

        <div className="fs-sl-cards">
          {cards.map((card) => (
            <button
              key={card.key}
              type="button"
              className={`fs-sl-card ${picked.source === 'card' && (picked.key ?? cards[0].key) === card.key ? 'is-active' : ''}`}
              onClick={() => setPicked({ source: 'card', key: card.key })}
            >
              <span className={`fs-sl-card__icon fs-sl-card__icon--${card.key}`}>
                <Icon name={card.icon} size={18} />
              </span>
              <strong>{card.title}</strong>
              <span>{card.caption}</span>
            </button>
          ))}
        </div>

        <Card padding="sm" title="Single event" description="Set the machine event yourself" className={picked.source === 'form' ? 'fs-sl-form is-active' : 'fs-sl-form'}>
          <div className="fs-sl-form__grid">
            <Select id="fs-sl-evtype" label="Event type" value={form.eventType} onChange={(eventType) => setField({ eventType })} options={EVENT_TYPES.map((t) => ({ value: t.id, label: t.label }))} />
            {form.eventType !== 'reduce_machine_load' ? (
              <>
                <NumberField id="fs-sl-start" label="Starts in" value={form.startHours} onChange={(startHours) => setField({ startHours })} min={0} step={0.5} suffix="h" />
                <NumberField
                  id="fs-sl-dur"
                  label="Duration"
                  value={form.durationHours}
                  onChange={(durationHours) => setField({ durationHours })}
                  min={0.5}
                  step={0.5}
                  suffix="h"
                  hint={form.eventType === 'preventive_maintenance' && pmHint !== null ? `last preventive service took ${pmHint} h` : undefined}
                />
              </>
            ) : null}
            {form.eventType === 'degraded' ? <NumberField id="fs-sl-factor" label="Output" value={form.capacityFactor} onChange={(capacityFactor) => setField({ capacityFactor })} min={0.05} max={0.95} step={0.05} hint="fraction of capacity" /> : null}
            {form.eventType === 'reduce_machine_load' ? <NumberField id="fs-sl-frac" label="Reduce by" value={form.fraction} onChange={(fraction) => setField({ fraction })} min={0.05} max={0.95} step={0.05} hint="fraction of its load" /> : null}
          </div>
        </Card>
      </div>
      <div className="fs-sl-quick__side">
        <ScenarioPreview scenario={scenario} preview={preview} onRun={() => onRun(scenario, picked.source === 'form' ? 'form' : 'quick')} />
      </div>
    </div>
  )
}

function ResultsTab({ runs, activeRunId, setActiveRunId, onRemove, asOf }) {
  const active = runs.find((r) => r.id === activeRunId) ?? runs[0]
  if (!active) {
    return (
      <div className="fs-sl-empty">
        <Icon name="flask" size={26} />
        <h3>No simulations yet</h3>
        <p className="fs-muted">Run a quick scenario, a custom one or a comparison set; every run is kept here for this session.</p>
      </div>
    )
  }
  return (
    <div className="fs-sl-results">
      <nav className="fs-sl-runs" aria-label="Simulation runs">
        {runs.map((run) => (
          <button key={run.id} type="button" className={`fs-sl-runs__item ${run.id === active.id ? 'is-active' : ''}`} onClick={() => setActiveRunId(run.id)}>
            <span className="fs-sl-runs__top">
              <span className="fs-sl-runs__seq">#{run.seq}</span>
              <span className="fs-sl-runs__name">{run.result.scenarioName}</span>
            </span>
            <span className="fs-sl-runs__stats">
              <span className={run.result.metrics.newDeadlineBreaches > 0 ? 'fs-text-danger' : ''}>{run.result.metrics.newDeadlineBreaches} new breach{run.result.metrics.newDeadlineBreaches === 1 ? '' : 'es'}</span>
              <span>{run.result.metrics.capacityLossLineHours} line-h lost</span>
              {run.asOf !== asOf ? <span className="fs-text-warning">earlier snapshot</span> : null}
            </span>
          </button>
        ))}
      </nav>
      <ResultView key={active.id} run={active} onRemove={() => onRemove(active.id)} />
    </div>
  )
}

export default function ScenarioLab() {
  const { state, view } = useFactoryData()
  const { scenarioRuns, addScenarioRun, removeScenarioRun, activeRunId, setActiveRunId, scenarioRequest, clearScenarioRequest, selectedMachineId } = useAppState()
  const request = scenarioRequest?.machineId && state.machines.some((m) => m.id === scenarioRequest.machineId) ? scenarioRequest : null
  const defaultMachine = request?.machineId ?? selectedMachineId ?? view.risks[0]?.machineId ?? state.machines[0]?.id
  const [tab, setTab] = useState(scenarioRuns.length && !request ? 'results' : 'quick')
  const [machineId, setMachineId] = useState(defaultMachine)
  const [draft, setDraft] = useState(() => ({ name: '', description: '', machineEvents: [blankEvent(defaultMachine)], actions: [] }))
  const [compareIds, setCompareIds] = useState([])

  // A request from another page (e.g. "Simulate failure" on a machine) is read once, then cleared.
  useEffect(() => {
    if (scenarioRequest) clearScenarioRequest()
  }, [scenarioRequest, clearScenarioRequest])

  const customScenario = useMemo(() => scenarioFromDraft(draft), [draft])
  const customPreview = useMemo(() => tryPreview(state, customScenario), [state, customScenario])

  const runAll = useCallback(
    (scenarios, source) => {
      let seq = scenarioRuns.reduce((max, run) => Math.max(max, run.seq), 0)
      return scenarios.map((scenario) => {
        seq += 1
        const numbered = withRunId(scenario, seq)
        const run = { id: numbered.id, seq, source, scenario: numbered, result: simulateScenario(state, numbered), asOf: state.asOf }
        addScenarioRun(run)
        return run
      })
    },
    [scenarioRuns, state, addScenarioRun],
  )

  const runOne = (scenario, source) => {
    runAll([scenario], source)
    setTab('results')
  }

  const runSet = (scenarios) => {
    const runs = runAll(scenarios, 'compare')
    setCompareIds(runs.map((r) => r.id))
  }

  return (
    <div className="fs-page fs-page--wide fs-sl">
      <header className="fs-sl__header">
        <div>
          <h2 className="fs-page__title">Scenario Lab</h2>
          <p className="fs-page__subtitle">Simulate possible futures with FORSEER’s deterministic engine and compare what each one does to lines, orders and deadlines.</p>
        </div>
        <span className="fs-sl__engine">
          <Icon name="cpu" size={14} /> Deterministic engine · snapshot {new Date(state.asOf).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
        </span>
      </header>
      <Tabs
        tabs={TABS.map((t) => (t.id === 'results' && scenarioRuns.length ? { ...t, label: `Results (${scenarioRuns.length})` } : t))}
        activeId={tab}
        onChange={setTab}
      />
      <div className="fs-sl__panel">
        {tab === 'quick' ? <QuickTab machineId={machineId} setMachineId={setMachineId} onRun={runOne} /> : null}
        {tab === 'custom' ? (
          <div className="fs-sl-quick">
            <div className="fs-sl-quick__main">
              <CustomBuilder draft={draft} setDraft={setDraft} defaultMachineId={machineId} />
            </div>
            <div className="fs-sl-quick__side">
              <ScenarioPreview scenario={customScenario} preview={customPreview} onRun={() => runOne(customScenario, 'custom')} />
            </div>
          </div>
        ) : null}
        {tab === 'compare' ? <ComparePanel machineId={machineId} runs={scenarioRuns} onRunSet={runSet} selectedIds={compareIds} setSelectedIds={setCompareIds} /> : null}
        {tab === 'results' ? <ResultsTab runs={scenarioRuns} activeRunId={activeRunId} setActiveRunId={setActiveRunId} onRemove={removeScenarioRun} asOf={state.asOf} /> : null}
      </div>
    </div>
  )
}
