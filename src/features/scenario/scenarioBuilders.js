// Turns a few user choices into engine scenario inputs. Pure: every number the
// Scenario Lab shows comes from simulateScenario() running these, never from here.
// The figures below are *inputs* (assumed durations and fractions), stated
// openly in each scenario's description so they can be read and challenged.
import { assignmentFor, backupsOf, maintenanceFor, primaryLineId } from '../factory/model.js'

export const DEFAULT_FAILURE_HOURS = 8
export const DEFAULT_PM_HOURS = 4
export const DEFAULT_LOAD_FRACTION = 0.5
export const DEFAULT_COMPARE_FAILURE = Object.freeze({ startHours: 12, durationHours: 16 })

const UNAVAILABLE_STATES = ['failed', 'retired']

export const EVENT_TYPES = Object.freeze([
  { id: 'failed', label: 'Unplanned failure', kind: 'event' },
  { id: 'degraded', label: 'Degraded output', kind: 'event' },
  { id: 'maintenance', label: 'Planned downtime', kind: 'event' },
  { id: 'preventive_maintenance', label: 'Preventive maintenance', kind: 'action' },
  { id: 'reduce_machine_load', label: 'Reduce load', kind: 'action' },
])

export const ACTION_LABELS = Object.freeze({
  preventive_maintenance: 'Preventive maintenance',
  repair: 'Repair',
  reroute_order: 'Reroute order work',
  split_workload: 'Shift workload',
  reduce_machine_load: 'Reduce machine load',
  reschedule_order: 'Reschedule order',
})

// Duration of the machine's most recent preventive service, if one is on record.
export function lastPreventiveHours(state, machineId) {
  const last = maintenanceFor(state, machineId).find((event) => event.eventType === 'preventive' && event.durationHours > 0)
  return last?.durationHours ?? null
}

// Machines the engine allows to take this machine's work (same type or a backup
// link), still running, ordered by the spare capacity the engine reports.
export function transferCandidates(state, view, machineId) {
  const machine = state.machines.find((m) => m.id === machineId)
  if (!machine) return []
  const backupIds = new Set(backupsOf(state, machineId).map((entry) => entry.machine?.id))
  return state.machines
    .filter((m) => m.id !== machineId && !UNAVAILABLE_STATES.includes(m.baselineState))
    .filter((m) => backupIds.has(m.id) || m.machineType === machine.machineType)
    .map((m) => {
      const capacity = view.capacityByMachineId.get(m.id)
      const spare = capacity ? Math.max(0, capacity.usableCapacityPerHour - capacity.assignedLoadPerHour) : 0
      return { machine: m, spare, backup: backupIds.has(m.id) }
    })
    .sort((a, b) => Number(b.backup) - Number(a.backup) || b.spare - a.spare || a.machine.code.localeCompare(b.machine.code, undefined, { numeric: true }))
}

// Load to move: all of the machine's own work on its line, capped by the target's spare capacity.
export function shiftableLoad(state, view, machineId, targetId) {
  const lineId = primaryLineId(state, machineId)
  const own = lineId ? (assignmentFor(state, machineId, lineId)?.contributionPerHour ?? 0) : 0
  const target = transferCandidates(state, view, machineId).find((c) => c.machine.id === targetId)
  return { lineId, loadPerHour: Math.min(own, target?.spare ?? 0) }
}

function failureEvent(machine, { startHours = 0, durationHours = DEFAULT_FAILURE_HOURS } = {}) {
  return { machineId: machine.id, state: 'failed', startHours, durationHours, label: `${machine.code} unplanned failure` }
}

function hoursText(hours) {
  return `${hours} h`
}

// The four one-click scenarios for a machine (plus a shift when an alternative exists).
export function quickScenarios(state, view, machineId) {
  const machine = state.machines.find((m) => m.id === machineId)
  if (!machine) return []
  const alternative = transferCandidates(state, view, machineId)[0] ?? null
  const pmHours = lastPreventiveHours(state, machineId)
  const cards = [
    {
      key: 'failure',
      title: 'Machine failure',
      caption: `${machine.code} fails now for ${hoursText(DEFAULT_FAILURE_HOURS)}`,
      icon: 'zap',
      scenario: {
        id: `quick-failure-${machine.code}`,
        name: `${machine.code} fails for ${hoursText(DEFAULT_FAILURE_HOURS)}`,
        description: `Assumption: ${machine.code} stops now and is back after ${hoursText(DEFAULT_FAILURE_HOURS)}.`,
        machineEvents: [failureEvent(machine)],
        actions: [],
      },
    },
    {
      key: 'preventive',
      title: 'Preventive maintenance',
      caption: `${machine.code} offline for ${hoursText(pmHours ?? DEFAULT_PM_HOURS)}`,
      icon: 'wrench',
      scenario: {
        id: `quick-preventive-${machine.code}`,
        name: `Preventive maintenance on ${machine.code} now`,
        description:
          pmHours === null
            ? `Assumption: a ${hoursText(DEFAULT_PM_HOURS)} service starting now (no previous preventive record to size it from), and no unplanned failure within the horizon.`
            : `Assumption: a service as long as ${machine.code}'s last preventive one (${hoursText(pmHours)}) starting now, and no unplanned failure within the horizon.`,
        machineEvents: [],
        actions: [{ type: 'preventive_maintenance', machineId: machine.id, durationHours: pmHours ?? DEFAULT_PM_HOURS, startHours: 0 }],
      },
    },
  ]
  if (alternative) {
    const alt = alternative.machine
    cards.push({
      key: 'multi-failure',
      title: 'Multiple failure',
      caption: `${machine.code} + ${alt.code} unavailable`,
      icon: 'layers',
      scenario: {
        id: `quick-multi-${machine.code}-${alt.code}`,
        name: `${machine.code} and ${alt.code} fail for ${hoursText(DEFAULT_FAILURE_HOURS)}`,
        description: `Assumption: ${machine.code} and its alternative ${alt.code} both stop now for ${hoursText(DEFAULT_FAILURE_HOURS)}, so no machine can cover.`,
        machineEvents: [failureEvent(machine), failureEvent(alt)],
        actions: [],
      },
    })
  }
  cards.push({
    key: 'load-reduction',
    title: 'Load reduction',
    caption: `Reduce ${machine.code} load by ${Math.round(DEFAULT_LOAD_FRACTION * 100)}%`,
    icon: 'activity',
    scenario: {
      id: `quick-reduce-${machine.code}`,
      name: `Run ${machine.code} at ${Math.round((1 - DEFAULT_LOAD_FRACTION) * 100)}% load`,
      description: `Assumption: ${machine.code} runs ${Math.round(DEFAULT_LOAD_FRACTION * 100)}% lighter; the work is not moved elsewhere, so output drops.`,
      machineEvents: [],
      actions: [{ type: 'reduce_machine_load', machineId: machine.id, fraction: DEFAULT_LOAD_FRACTION }],
    },
  })
  if (alternative) {
    const { lineId, loadPerHour } = shiftableLoad(state, view, machineId, alternative.machine.id)
    if (lineId && loadPerHour > 0) {
      cards.push({
        key: 'shift',
        title: 'Shift workload',
        caption: `Move ${loadPerHour}/h of ${machine.code} work to ${alternative.machine.code}`,
        icon: 'shuffle',
        scenario: {
          id: `quick-shift-${machine.code}-${alternative.machine.code}`,
          name: `Shift ${loadPerHour}/h from ${machine.code} to ${alternative.machine.code}`,
          description: `Assumption: ${alternative.machine.code} absorbs ${loadPerHour} units/h of ${machine.code}'s work (its current spare capacity) and ${machine.code} does not fail within the horizon.`,
          machineEvents: [],
          actions: [{ type: 'split_workload', fromMachineId: machine.id, productionLineId: lineId, splits: [{ targetMachineId: alternative.machine.id, loadPerHour }] }],
        },
      })
    }
  }
  return cards
}

// One scenario from the single-event form.
export function buildEventScenario(state, { machineId, eventType, startHours, durationHours, capacityFactor, fraction }) {
  const machine = state.machines.find((m) => m.id === machineId)
  if (!machine) return null
  const code = machine.code
  const type = EVENT_TYPES.find((t) => t.id === eventType)
  const base = { id: `custom-${eventType}-${code}`, machineEvents: [], actions: [] }
  if (eventType === 'reduce_machine_load') {
    return {
      ...base,
      name: `Run ${code} ${Math.round(fraction * 100)}% lighter`,
      description: `Assumption: ${code} load is reduced by ${Math.round(fraction * 100)}%; the work is not moved.`,
      actions: [{ type: 'reduce_machine_load', machineId, fraction }],
    }
  }
  if (eventType === 'preventive_maintenance') {
    return {
      ...base,
      name: `Preventive maintenance on ${code} (${hoursText(durationHours)})`,
      description: `Assumption: ${code} is serviced for ${hoursText(durationHours)} starting ${startHours} h from now, then runs healthy.`,
      actions: [{ type: 'preventive_maintenance', machineId, durationHours, startHours }],
    }
  }
  const event = { machineId, state: eventType, startHours, durationHours, label: `${code} ${type?.label.toLowerCase() ?? eventType}` }
  if (eventType === 'degraded') event.capacityFactor = capacityFactor
  return {
    ...base,
    name: `${code} ${type?.label.toLowerCase() ?? eventType} for ${hoursText(durationHours)}`,
    description: `Assumption: ${code} is ${eventType === 'degraded' ? `degraded to ${Math.round(capacityFactor * 100)}% output` : eventType === 'failed' ? 'down' : 'offline'} from ${startHours} h to ${startHours + durationHours} h from now.`,
    machineEvents: [event],
  }
}

// ---- Custom builder drafts ----
// Drafts mirror the engine format, but numeric fields stay strings while the
// user types; scenarioFromDraft converts them and the engine validates the rest.

const NUMERIC_FIELDS = ['startHours', 'durationHours', 'capacityFactor', 'loadPerHour', 'fraction']
const OPTIONAL_NUMERIC = new Set(['startHours', 'loadPerHour', 'capacityFactor'])

const toText = (value) => (value === undefined || value === null ? '' : String(value))

function numbersToText(record) {
  const out = { ...record }
  for (const key of NUMERIC_FIELDS) if (key in out) out[key] = toText(out[key])
  if (out.splits) out.splits = out.splits.map((split) => ({ ...split, loadPerHour: toText(split.loadPerHour) }))
  return out
}

function textToNumbers(record) {
  const out = { ...record }
  for (const key of NUMERIC_FIELDS) {
    if (!(key in out)) continue
    const text = String(out[key]).trim()
    if (text === '' && OPTIONAL_NUMERIC.has(key)) delete out[key]
    else if (key === 'durationHours' && text === '') out[key] = null
    else out[key] = Number(text)
  }
  if (out.splits) out.splits = out.splits.map((split) => ({ ...split, loadPerHour: Number(split.loadPerHour) }))
  return out
}

export function blankEvent(machineId) {
  return { machineId, state: 'failed', startHours: '0', durationHours: String(DEFAULT_FAILURE_HOURS), capacityFactor: '' }
}

export function blankAction(type, state, view, machineId) {
  const lineId = primaryLineId(state, machineId)
  const order = state.orders.find((o) => o.productionLineId === lineId && ['pending', 'in_progress', 'at_risk', 'late'].includes(o.status))
  const target = transferCandidates(state, view, machineId)[0]?.machine.id ?? ''
  switch (type) {
    case 'preventive_maintenance':
    case 'repair':
      return { type, machineId, durationHours: String(lastPreventiveHours(state, machineId) ?? DEFAULT_PM_HOURS), startHours: '0' }
    case 'reroute_order':
      return { type, orderId: order?.id ?? '', fromMachineId: machineId, targetMachineId: target, loadPerHour: '' }
    case 'split_workload': {
      const { loadPerHour } = target ? shiftableLoad(state, view, machineId, target) : { loadPerHour: 0 }
      return { type, fromMachineId: machineId, productionLineId: lineId ?? '', splits: [{ targetMachineId: target, loadPerHour: String(loadPerHour || '') }] }
    }
    case 'reduce_machine_load':
      return { type, machineId, fraction: String(DEFAULT_LOAD_FRACTION) }
    case 'reschedule_order':
      return { type, orderId: order?.id ?? '', newDeadline: order?.deadline ?? '' }
    default:
      return { type }
  }
}

export function draftFromScenario(scenario) {
  return {
    name: scenario.name ?? '',
    description: scenario.description ?? '',
    machineEvents: (scenario.machineEvents ?? []).map((event) => ({ capacityFactor: '', ...numbersToText(event) })),
    actions: (scenario.actions ?? []).map(numbersToText),
  }
}

export function scenarioFromDraft(draft, id = 'custom') {
  const scenario = {
    id,
    name: draft.name.trim() || 'Custom scenario',
    machineEvents: draft.machineEvents.map((event) => {
      const out = textToNumbers(event)
      if (out.state !== 'degraded') delete out.capacityFactor
      return out
    }),
    actions: draft.actions.map(textToNumbers),
  }
  if (draft.description.trim()) scenario.description = draft.description.trim()
  return scenario
}

// BEFORE-mode comparison for one machine: the failure left alone against the
// interventions FORSEER can simulate. Each option states what it assumes.
export function beforeComparisonSet(state, view, machineId, failure = DEFAULT_COMPARE_FAILURE) {
  const machine = state.machines.find((m) => m.id === machineId)
  if (!machine) return []
  const code = machine.code
  const event = failureEvent(machine, failure)
  const when = `fails ${failure.startHours} h from now and the repair takes ${hoursText(failure.durationHours)}`
  const pmHours = lastPreventiveHours(state, machineId) ?? DEFAULT_PM_HOURS
  const set = [
    {
      id: `before-do-nothing-${code}`,
      name: 'Do nothing',
      description: `Assumption: ${code} keeps running as it is, ${when}.`,
      machineEvents: [event],
      actions: [],
    },
    {
      id: `before-preventive-${code}`,
      name: `Preventive maintenance on ${code} now`,
      description: `Assumption: a ${hoursText(pmHours)} service starting now prevents the failure within the horizon.`,
      machineEvents: [],
      actions: [{ type: 'preventive_maintenance', machineId, durationHours: pmHours, startHours: 0 }],
    },
  ]
  const alternative = transferCandidates(state, view, machineId)[0]
  if (alternative) {
    const { lineId, loadPerHour } = shiftableLoad(state, view, machineId, alternative.machine.id)
    if (lineId && loadPerHour > 0) {
      const alt = alternative.machine.code
      const split = { type: 'split_workload', fromMachineId: machineId, productionLineId: lineId, splits: [{ targetMachineId: alternative.machine.id, loadPerHour }] }
      set.push(
        {
          id: `before-reroute-${code}-${alt}`,
          name: `${code} fails; ${alt} covers ${loadPerHour}/h`,
          description: `Same failure as "Do nothing", but ${alt} takes over ${loadPerHour} units/h of ${code}'s work (its current spare capacity).`,
          machineEvents: [event],
          actions: [split],
        },
        {
          id: `before-shift-${code}-${alt}`,
          name: `Shift ${loadPerHour}/h of ${code} load to ${alt}`,
          description: `Assumption: running ${code} lighter avoids the failure within the horizon (FORSEER does not calculate this); ${alt} absorbs ${loadPerHour} units/h.`,
          machineEvents: [],
          actions: [split],
        },
      )
    }
  }
  return set
}

// Parameter for findBreakingPoint on the first failure-like event of a scenario.
export function breakingPointParameter(scenario, { orderId = null, max = 72 } = {}) {
  const eventIndex = scenario.machineEvents.findIndex((e) => e.state === 'failed' || e.state === 'maintenance' || e.state === 'degraded')
  if (eventIndex < 0) return null
  return {
    name: 'durationHours',
    eventIndex,
    min: 0,
    max,
    step: 1,
    precision: 0.1,
    condition: orderId ? { type: 'order_status_at_least', orderId, status: 'BREACHED' } : { type: 'any_new_deadline_breach' },
  }
}

// Scenario ids must be unique within a comparison; runs get a numbered suffix.
export function withRunId(scenario, n) {
  return { ...scenario, id: `${scenario.id}#${n}` }
}
