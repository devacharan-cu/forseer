import { naturalCompare, round } from './helpers.js'

// Kahn's algorithm. nodeIds must already be in a deterministic order; ties are
// always resolved by that order so the result never depends on insertion order.
export function topologicalOrder(nodeIds, edges) {
  const position = new Map(nodeIds.map((id, index) => [id, index]))
  const indegree = new Map(nodeIds.map((id) => [id, 0]))
  const outgoing = new Map(nodeIds.map((id) => [id, []]))
  for (const [from, to] of edges) {
    outgoing.get(from).push(to)
    indegree.set(to, indegree.get(to) + 1)
  }

  const ready = nodeIds.filter((id) => indegree.get(id) === 0)
  const order = []
  while (ready.length > 0) {
    ready.sort((a, b) => position.get(a) - position.get(b))
    const id = ready.shift()
    order.push(id)
    for (const next of outgoing.get(id)) {
      indegree.set(next, indegree.get(next) - 1)
      if (indegree.get(next) === 0) ready.push(next)
    }
  }

  const placed = new Set(order)
  return { order, cyclic: nodeIds.filter((id) => !placed.has(id)) }
}

// Causal steps, in the order effects propagate through the factory.
export const CASCADE_STEPS = Object.freeze({
  TRIGGER: 0,
  MACHINE_TO_MACHINE: 1,
  MACHINE_TO_LINE: 2,
  LINE_TO_ORDER: 3,
  ORDER_TO_DEADLINE: 4,
})

// Assembles the causal chain  trigger -> machine -> machine -> line -> order -> deadline
// from quantities the simulation has already computed. It never computes impacts itself.
export function buildCascade({ triggers, actionEffects, machineAnalyses, orderAnalyses, secondaryRisks, labels, epsilon }) {
  const records = []
  const add = (record) => records.push(record)
  const machine = (id) => labels.machines.get(id) ?? id
  const line = (id) => labels.lines.get(id) ?? id
  const order = (id) => labels.orders.get(id) ?? id

  for (const trigger of triggers) {
    const fromScenario = trigger.origin === 'scenario'
    const sourceId = fromScenario ? trigger.label ?? `machineEvents[${trigger.index}]` : trigger.actionType
    add({
      step: CASCADE_STEPS.TRIGGER,
      source: fromScenario ? 'scenario_event' : 'action',
      sourceId,
      sourceLabel: trigger.label ?? sourceId,
      target: 'machine',
      targetId: trigger.machineId,
      targetLabel: machine(trigger.machineId),
      impactType: 'state_change',
      magnitude: round(trigger.endHours - trigger.startHours, 2),
      unit: 'hours',
      detail: { state: trigger.state, startHours: round(trigger.startHours, 2), endHours: round(trigger.endHours, 2) },
    })
  }

  for (const effect of actionEffects) {
    if (effect.kind === 'load_reduction') {
      add({
        step: CASCADE_STEPS.TRIGGER,
        source: 'action',
        sourceId: 'reduce_machine_load',
        sourceLabel: 'reduce_machine_load',
        target: 'machine',
        targetId: effect.machineId,
        targetLabel: machine(effect.machineId),
        impactType: 'load_reduction',
        magnitude: round(effect.fraction, 4),
        unit: 'fraction_of_load',
      })
    } else if (effect.kind === 'deadline_change') {
      add({
        step: CASCADE_STEPS.TRIGGER,
        source: 'action',
        sourceId: 'reschedule_order',
        sourceLabel: 'reschedule_order',
        target: 'order',
        targetId: effect.orderId,
        targetLabel: order(effect.orderId),
        impactType: 'deadline_change',
        magnitude: round(effect.shiftHours, 2),
        unit: 'hours',
        detail: { previousDeadline: effect.previousDeadline, newDeadline: effect.newDeadline },
      })
    } else if (effect.kind === 'load_transfer') {
      for (const transfer of effect.transfers) {
        add({
          step: CASCADE_STEPS.MACHINE_TO_MACHINE,
          source: 'machine',
          sourceId: transfer.fromMachineId,
          sourceLabel: machine(transfer.fromMachineId),
          target: 'machine',
          targetId: transfer.targetMachineId,
          targetLabel: machine(transfer.targetMachineId),
          impactType: 'load_transfer',
          magnitude: round(transfer.loadPerHour, 2),
          unit: 'capacity_units_per_hour',
          detail: { productionLineId: transfer.productionLineId, lineLabel: line(transfer.productionLineId) },
        })
      }
    }
  }

  for (const analysis of machineAnalyses) {
    for (const [upstreamId, hours] of analysis.starvedBy) {
      if (hours <= epsilon) continue
      add({
        step: CASCADE_STEPS.MACHINE_TO_MACHINE,
        source: 'machine',
        sourceId: upstreamId,
        sourceLabel: machine(upstreamId),
        target: 'machine',
        targetId: analysis.machine.id,
        targetLabel: machine(analysis.machine.id),
        impactType: 'upstream_starvation',
        magnitude: round(hours, 2),
        unit: 'hours',
      })
    }
  }

  for (const risk of secondaryRisks) {
    for (const coveredId of risk.coveringForMachineIds) {
      add({
        step: CASCADE_STEPS.MACHINE_TO_MACHINE,
        source: 'machine',
        sourceId: coveredId,
        sourceLabel: machine(coveredId),
        target: 'machine',
        targetId: risk.machineId,
        targetLabel: machine(risk.machineId),
        impactType: risk.riskType === 'overload' ? 'secondary_overload' : 'secondary_high_utilization',
        magnitude: risk.scenarioPeakUtilization,
        unit: 'utilization_ratio',
      })
    }
  }

  for (const analysis of machineAnalyses) {
    for (const [lineId, lostLineHours] of analysis.lineEffects) {
      if (Math.abs(lostLineHours) <= epsilon) continue
      add({
        step: CASCADE_STEPS.MACHINE_TO_LINE,
        source: 'machine',
        sourceId: analysis.machine.id,
        sourceLabel: machine(analysis.machine.id),
        target: 'production_line',
        targetId: lineId,
        targetLabel: line(lineId),
        impactType: lostLineHours > 0 ? 'capacity_reduction' : 'capacity_increase',
        magnitude: round(Math.abs(lostLineHours), 2),
        unit: 'line_hours',
      })
    }
  }

  for (const analysis of orderAnalyses) {
    const { order: current, baseline, scenario, delayHours } = analysis
    let impactType = null
    if (!scenario.canComplete && baseline.canComplete) impactType = 'cannot_complete'
    else if (delayHours !== null && delayHours > epsilon) impactType = 'completion_delay'
    else if (delayHours !== null && delayHours < -epsilon) impactType = 'completion_advance'
    if (impactType !== null) {
      add({
        step: CASCADE_STEPS.LINE_TO_ORDER,
        source: 'production_line',
        sourceId: current.productionLineId,
        sourceLabel: line(current.productionLineId),
        target: 'order',
        targetId: current.id,
        targetLabel: current.orderNumber,
        impactType,
        magnitude: delayHours === null ? null : round(Math.abs(delayHours), 2),
        unit: 'hours',
      })
    }
    if (analysis.statusChanged) {
      add({
        step: CASCADE_STEPS.ORDER_TO_DEADLINE,
        source: 'order',
        sourceId: current.id,
        sourceLabel: current.orderNumber,
        target: 'deadline',
        targetId: current.id,
        targetLabel: current.orderNumber,
        impactType: 'deadline_status_change',
        magnitude: round(scenario.slackHours, 2),
        unit: 'slack_hours',
        detail: { from: baseline.status, to: scenario.status },
      })
    }
  }

  return records.sort(
    (a, b) =>
      a.step - b.step ||
      naturalCompare(a.sourceLabel, b.sourceLabel) ||
      naturalCompare(a.targetLabel, b.targetLabel) ||
      naturalCompare(a.impactType, b.impactType),
  )
}
