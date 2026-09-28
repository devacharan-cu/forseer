import { useState } from 'react'
import { parseScenario } from '../../ai/index.js'
import Button from '../../components/ui/Button.jsx'
import Card from '../../components/ui/Card.jsx'
import Icon from '../../components/ui/Icon.jsx'
import Input from '../../components/ui/Input.jsx'
import Select, { NumberField } from '../../components/ui/Select.jsx'
import Spinner from '../../components/ui/Spinner.jsx'
import { ACTION_TYPES } from '../../engine/index.js'
import { useFactoryData } from '../../state/FactoryDataContext.jsx'
import { aiErrorMessage, getAiProvider } from '../ai/aiProvider.js'
import { openOrders } from '../factory/model.js'
import { ACTION_LABELS, blankAction, blankEvent, draftFromScenario } from './scenarioBuilders.js'

const EVENT_STATES = [
  { value: 'failed', label: 'Unplanned failure' },
  { value: 'maintenance', label: 'Planned downtime' },
  { value: 'degraded', label: 'Degraded output' },
]

const pad = (n) => String(n).padStart(2, '0')
function toLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function fromLocalInput(value) {
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? '' : new Date(ms).toISOString()
}

function useOptions() {
  const { state } = useFactoryData()
  return {
    machines: state.machines.map((m) => ({ value: m.id, label: `${m.code} · ${m.name}` })),
    orders: openOrders(state).map((o) => ({ value: o.id, label: `${o.orderNumber} · ${state.productionLines.find((l) => l.id === o.productionLineId)?.code ?? ''}` })),
    lines: state.productionLines.map((l) => ({ value: l.id, label: `${l.code} · ${l.name}` })),
  }
}

function withBlank(options, value) {
  return value ? options : [{ value: '', label: 'Choose…' }, ...options]
}

function EventRow({ event, index, onChange, onRemove }) {
  const options = useOptions()
  const id = `fs-ev-${index}`
  return (
    <div className="fs-sl-row">
      <div className="fs-sl-row__fields">
        <Select id={`${id}-m`} label="Machine" value={event.machineId} onChange={(machineId) => onChange({ machineId })} options={withBlank(options.machines, event.machineId)} />
        <Select id={`${id}-s`} label="Event" value={event.state} onChange={(state) => onChange({ state })} options={EVENT_STATES} />
        <NumberField id={`${id}-start`} label="Starts in" value={event.startHours} onChange={(startHours) => onChange({ startHours })} min={0} step={0.5} suffix="h" />
        <NumberField id={`${id}-dur`} label="Duration" value={event.durationHours ?? ''} onChange={(durationHours) => onChange({ durationHours })} min={0} step={0.5} suffix="h" hint="empty = until the horizon ends" />
        {event.state === 'degraded' ? (
          <NumberField id={`${id}-f`} label="Output" value={event.capacityFactor} onChange={(capacityFactor) => onChange({ capacityFactor })} min={0.05} max={0.95} step={0.05} hint="fraction of capacity, e.g. 0.6" />
        ) : null}
      </div>
      <Button variant="ghost" size="sm" iconOnly icon={<Icon name="trash" size={14} />} aria-label="Remove event" onClick={onRemove} />
    </div>
  )
}

function ActionRow({ action, index, onChange, onRemove }) {
  const options = useOptions()
  const id = `fs-ac-${index}`
  const machine = (key, label) => (
    <Select id={`${id}-${key}`} label={label} value={action[key]} onChange={(v) => onChange({ [key]: v })} options={withBlank(options.machines, action[key])} />
  )
  const order = (
    <Select id={`${id}-o`} label="Order" value={action.orderId} onChange={(orderId) => onChange({ orderId })} options={withBlank(options.orders, action.orderId)} />
  )
  const hours = (key, label, hint) => (
    <NumberField id={`${id}-${key}`} label={label} value={action[key]} onChange={(v) => onChange({ [key]: v })} min={0} step={0.5} suffix="h" hint={hint} />
  )
  const setSplit = (i, patch) => onChange({ splits: action.splits.map((split, j) => (j === i ? { ...split, ...patch } : split)) })

  let fields
  switch (action.type) {
    case 'preventive_maintenance':
    case 'repair':
      fields = (
        <>
          {machine('machineId', 'Machine')}
          {hours('startHours', 'Starts in')}
          {hours('durationHours', 'Duration')}
        </>
      )
      break
    case 'reroute_order':
      fields = (
        <>
          {order}
          {machine('fromMachineId', 'From machine')}
          {machine('targetMachineId', 'To machine')}
          <NumberField id={`${id}-l`} label="Load" value={action.loadPerHour} onChange={(loadPerHour) => onChange({ loadPerHour })} min={0} suffix="/h" hint="empty = all of it" />
        </>
      )
      break
    case 'split_workload':
      fields = (
        <>
          {machine('fromMachineId', 'From machine')}
          <Select id={`${id}-line`} label="Line" value={action.productionLineId} onChange={(productionLineId) => onChange({ productionLineId })} options={withBlank(options.lines, action.productionLineId)} />
          {action.splits.map((split, i) => (
            <span key={i} className="fs-sl-row__pair">
              <Select id={`${id}-t${i}`} label={`To machine${action.splits.length > 1 ? ` ${i + 1}` : ''}`} value={split.targetMachineId} onChange={(targetMachineId) => setSplit(i, { targetMachineId })} options={withBlank(options.machines, split.targetMachineId)} />
              <NumberField id={`${id}-tl${i}`} label="Load" value={split.loadPerHour} onChange={(loadPerHour) => setSplit(i, { loadPerHour })} min={0} suffix="/h" />
            </span>
          ))}
        </>
      )
      break
    case 'reduce_machine_load':
      fields = (
        <>
          {machine('machineId', 'Machine')}
          <NumberField id={`${id}-fr`} label="Reduce by" value={action.fraction} onChange={(fraction) => onChange({ fraction })} min={0.05} max={0.95} step={0.05} hint="fraction of its load, e.g. 0.5" />
        </>
      )
      break
    case 'reschedule_order':
      fields = (
        <>
          {order}
          <label className="fs-field" htmlFor={`${id}-dl`}>
            <span className="fs-field__label">New deadline</span>
            <Input id={`${id}-dl`} type="datetime-local" value={toLocalInput(action.newDeadline)} onChange={(e) => onChange({ newDeadline: fromLocalInput(e.target.value) })} />
          </label>
        </>
      )
      break
    default:
      fields = null
  }

  return (
    <div className="fs-sl-row">
      <div className="fs-sl-row__type">{ACTION_LABELS[action.type] ?? action.type}</div>
      <div className="fs-sl-row__fields">{fields}</div>
      <Button variant="ghost" size="sm" iconOnly icon={<Icon name="trash" size={14} />} aria-label="Remove action" onClick={onRemove} />
    </div>
  )
}

function AskPanel({ onScenario }) {
  const { state } = useFactoryData()
  const [text, setText] = useState('')
  const [status, setStatus] = useState('idle')
  const [reply, setReply] = useState(null)

  async function interpret(event) {
    event.preventDefault()
    setStatus('running')
    setReply(null)
    try {
      const parsed = await parseScenario({ provider: getAiProvider(), factoryState: state, text, scenarioId: 'what-if' })
      setReply(parsed)
      if (parsed.type === 'scenario') onScenario(parsed.scenario)
    } catch (error) {
      setReply({ type: 'error', message: aiErrorMessage(error) })
    }
    setStatus('idle')
  }

  return (
    <form className="fs-sl-ask" onSubmit={interpret}>
      <div className="fs-sl-ask__head">
        <Icon name="sparkles" size={15} />
        <strong>Describe it in plain language</strong>
        <span className="fs-muted">AI turns the question into the scenario below; the engine still does every calculation.</span>
      </div>
      <div className="fs-sl-ask__input">
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. What if M4 fails tomorrow morning for 10 hours and M7 covers 25 units an hour?" aria-label="Describe a scenario" />
        <Button type="submit" variant="secondary" size="sm" disabled={!text.trim() || status === 'running'}>
          {status === 'running' ? <Spinner size={14} /> : null}
          Interpret
        </Button>
      </div>
      {reply?.type === 'scenario' ? (
        <p className="fs-sl-ask__ok">
          <Icon name="check" size={14} /> Loaded: {reply.interpretation}
          {reply.assumptions?.length ? <span className="fs-muted"> · assumptions: {reply.assumptions.join('; ')}</span> : null}
        </p>
      ) : null}
      {reply?.type === 'clarification_required' ? <p className="fs-sl-ask__note">{reply.question}</p> : null}
      {reply?.type === 'unsupported' ? <p className="fs-sl-ask__note">{reply.reason}</p> : null}
      {reply?.type === 'invalid_scenario' ? <p className="fs-sl-ask__note">The engine rejected the interpreted scenario: {reply.issues.join('; ')}</p> : null}
      {reply?.type === 'error' ? (
        <p className="fs-sl-ask__note">
          {reply.message} You can still build the scenario by hand below.
        </p>
      ) : null}
    </form>
  )
}

export default function CustomBuilder({ draft, setDraft, defaultMachineId }) {
  const { state, view } = useFactoryData()
  const [newAction, setNewAction] = useState('preventive_maintenance')
  const patch = (p) => setDraft((d) => ({ ...d, ...p }))
  const setEvent = (i, p) => setDraft((d) => ({ ...d, machineEvents: d.machineEvents.map((e, j) => (j === i ? { ...e, ...p } : e)) }))
  const setAction = (i, p) => setDraft((d) => ({ ...d, actions: d.actions.map((a, j) => (j === i ? { ...a, ...p } : a)) }))

  return (
    <div className="fs-sl-builder">
      <AskPanel onScenario={(scenario) => setDraft(draftFromScenario(scenario))} />

      <Card padding="sm" title="Scenario">
        <div className="fs-sl-builder__meta">
          <label className="fs-field" htmlFor="fs-sc-name">
            <span className="fs-field__label">Name</span>
            <Input id="fs-sc-name" value={draft.name} onChange={(e) => patch({ name: e.target.value })} placeholder="Custom scenario" />
          </label>
          <label className="fs-field" htmlFor="fs-sc-desc">
            <span className="fs-field__label">Assumptions</span>
            <Input id="fs-sc-desc" value={draft.description} onChange={(e) => patch({ description: e.target.value })} placeholder="What this future assumes, in words" />
          </label>
        </div>
      </Card>

      <Card
        padding="sm"
        title="Machine events"
        description="Failures, planned downtime and degradation on the timeline"
        actions={
          <Button size="sm" variant="secondary" icon={<Icon name="plus" size={14} />} onClick={() => patch({ machineEvents: [...draft.machineEvents, blankEvent(defaultMachineId)] })}>
            Add event
          </Button>
        }
      >
        {draft.machineEvents.length === 0 ? <p className="fs-muted">No machine events.</p> : null}
        {draft.machineEvents.map((event, i) => (
          <EventRow key={i} index={i} event={event} onChange={(p) => setEvent(i, p)} onRemove={() => patch({ machineEvents: draft.machineEvents.filter((_, j) => j !== i) })} />
        ))}
      </Card>

      <Card
        padding="sm"
        title="Actions"
        description="Interventions applied before the timeline runs"
        actions={
          <div className="fs-sl-builder__add">
            <Select id="fs-sc-newaction" value={newAction} onChange={setNewAction} options={ACTION_TYPES.map((t) => ({ value: t, label: ACTION_LABELS[t] ?? t }))} />
            <Button size="sm" variant="secondary" icon={<Icon name="plus" size={14} />} onClick={() => patch({ actions: [...draft.actions, blankAction(newAction, state, view, defaultMachineId)] })}>
              Add
            </Button>
          </div>
        }
      >
        {draft.actions.length === 0 ? <p className="fs-muted">No actions.</p> : null}
        {draft.actions.map((action, i) => (
          <ActionRow key={i} index={i} action={action} onChange={(p) => setAction(i, p)} onRemove={() => patch({ actions: draft.actions.filter((_, j) => j !== i) })} />
        ))}
      </Card>
    </div>
  )
}
