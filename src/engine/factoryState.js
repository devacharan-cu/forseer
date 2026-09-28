import { topologicalOrder } from './cascade.js'
import { CONSTRAINING_DEPENDENCY_TYPES, DB_VOCABULARY, ENGINE_STATE_VERSION } from './constants.js'
import { isPlainObject, naturalCompare, parseTimestamp, TINY } from './helpers.js'
import { deriveBaselineState } from './machineStates.js'
import { EngineValidationError, isFiniteNumber, throwIfIssues } from './validation.js'

// Converts database rows (snake_case, as returned by src/api/) into the
// engine's canonical camelCase factory state. `asOf` is required: the engine
// never reads the system clock, so the same snapshot always simulates the same way.
export function normalizeFactoryState(raw, options = {}) {
  if (!isPlainObject(raw)) throw new EngineValidationError('Factory data must be an object of table rows')

  const issues = []
  const asOfMs = parseTimestamp(options.asOf)
  if (asOfMs === null) {
    issues.push('options.asOf must be a valid timestamp (the engine never reads the system clock)')
  }

  const rowsOf = (key, required) => {
    const rows = raw[key]
    if (rows === undefined && !required) return []
    if (!Array.isArray(rows)) {
      issues.push(`${key} must be an array`)
      return []
    }
    return rows
  }

  const machines = rowsOf('machines', true).map((row, index) => {
    const read = rowReader(row, `machines[${index}]`, issues)
    const status = read.text('status', { allowed: DB_VOCABULARY.machineStatus })
    const healthState = read.text('health_state', { allowed: DB_VOCABULARY.healthState })
    return {
      id: read.text('id'),
      code: read.text('code'),
      name: read.text('name'),
      machineType: read.text('machine_type'),
      status,
      healthState,
      baselineState: deriveBaselineState(status, healthState),
      capacityPerHour: read.number('capacity_per_hour'),
      maintenanceIntervalDays: read.number('maintenance_interval_days'),
      lastMaintenanceAt: read.timestamp('last_maintenance_at', { required: false }),
      stageNominalPerHour: 0,
    }
  })

  const productionLines = rowsOf('productionLines', true).map((row, index) => {
    const read = rowReader(row, `productionLines[${index}]`, issues)
    return {
      id: read.text('id'),
      code: read.text('code'),
      name: read.text('name'),
      capacityPerHour: read.number('capacity_per_hour'),
      status: read.text('status', { allowed: DB_VOCABULARY.lineStatus }),
      nominalCapacityPerHour: 0,
    }
  })

  const machineLineAssignments = rowsOf('machineLineAssignments', true).map((row, index) => {
    const read = rowReader(row, `machineLineAssignments[${index}]`, issues)
    return {
      id: read.text('id'),
      machineId: read.text('machine_id'),
      productionLineId: read.text('production_line_id'),
      contributionPerHour: read.number('contribution_per_hour'),
      isPrimary: read.boolean('is_primary', true),
      coversMachineId: null,
    }
  })

  const orders = rowsOf('orders', true).map((row, index) => {
    const read = rowReader(row, `orders[${index}]`, issues)
    return {
      id: read.text('id'),
      orderNumber: read.text('order_number'),
      productionLineId: read.text('production_line_id'),
      quantity: read.number('quantity'),
      requiredProductionHours: read.number('required_production_hours'),
      priority: read.text('priority', { allowed: DB_VOCABULARY.priority }),
      deadline: read.timestamp('deadline'),
      status: read.text('status', { allowed: DB_VOCABULARY.orderStatus }),
    }
  })

  const maintenanceEvents = rowsOf('maintenanceEvents', false).map((row, index) => {
    const read = rowReader(row, `maintenanceEvents[${index}]`, issues)
    return {
      id: read.text('id'),
      machineId: read.text('machine_id'),
      eventType: read.text('event_type', { allowed: DB_VOCABULARY.maintenanceEventType }),
      description: read.text('description', { required: false }),
      occurredAt: read.timestamp('occurred_at'),
      durationHours: read.number('duration_hours', { required: false }),
      outcome: read.text('outcome', { required: false, allowed: DB_VOCABULARY.maintenanceOutcome }),
    }
  })

  const incidents = rowsOf('incidents', false).map((row, index) => {
    const read = rowReader(row, `incidents[${index}]`, issues)
    return {
      id: read.text('id'),
      machineId: read.text('machine_id'),
      description: read.text('description'),
      severity: read.text('severity', { allowed: DB_VOCABULARY.incidentSeverity }),
      status: read.text('status', { allowed: DB_VOCABULARY.incidentStatus }),
      detectedAt: read.timestamp('detected_at'),
      resolvedAt: read.timestamp('resolved_at', { required: false }),
    }
  })

  const machineDependencies = rowsOf('machineDependencies', false).map((row, index) => {
    const read = rowReader(row, `machineDependencies[${index}]`, issues)
    return {
      id: read.text('id'),
      machineId: read.text('machine_id'),
      dependsOnMachineId: read.text('depends_on_machine_id'),
      dependencyType: read.text('dependency_type', { allowed: DB_VOCABULARY.dependencyType }),
      notes: read.text('notes', { required: false }),
    }
  })

  throwIfIssues('Invalid factory data', issues)

  checkReferences({ machines, productionLines, machineLineAssignments, orders, maintenanceEvents, incidents, machineDependencies }, issues)
  throwIfIssues('Invalid factory data', issues)

  const machinesById = new Map(machines.map((machine) => [machine.id, machine]))
  const linesById = new Map(productionLines.map((line) => [line.id, line]))
  for (const assignment of machineLineAssignments) {
    machinesById.get(assignment.machineId).stageNominalPerHour += assignment.contributionPerHour
    linesById.get(assignment.productionLineId).nominalCapacityPerHour += assignment.contributionPerHour
  }

  const warnings = []
  for (const line of productionLines) {
    if (Math.abs(line.capacityPerHour - line.nominalCapacityPerHour) > TINY) {
      warnings.push({
        code: 'line_capacity_mismatch',
        entityId: line.id,
        message: `${line.code}: capacity_per_hour is ${line.capacityPerHour} but its machine assignments sum to ${line.nominalCapacityPerHour}; the engine uses the assignment sum`,
      })
    }
  }
  for (const machine of machines) {
    if (machine.stageNominalPerHour > machine.capacityPerHour + TINY) {
      warnings.push({
        code: 'machine_overallocated',
        entityId: machine.id,
        message: `${machine.code}: assigned ${machine.stageNominalPerHour}/h across lines but capacity is ${machine.capacityPerHour}/h`,
      })
    }
  }

  const codeOf = (id) => machinesById.get(id).code
  const lineCodeOf = (id) => linesById.get(id).code
  const byTimeThenId = (key) => (a, b) => Date.parse(a[key]) - Date.parse(b[key]) || naturalCompare(a.id, b.id)

  return {
    engineStateVersion: ENGINE_STATE_VERSION,
    asOf: new Date(asOfMs).toISOString(),
    machines: machines.sort((a, b) => naturalCompare(a.code, b.code)),
    productionLines: productionLines.sort((a, b) => naturalCompare(a.code, b.code)),
    machineLineAssignments: machineLineAssignments.sort(
      (a, b) => naturalCompare(codeOf(a.machineId), codeOf(b.machineId)) || naturalCompare(lineCodeOf(a.productionLineId), lineCodeOf(b.productionLineId)),
    ),
    orders: orders.sort((a, b) => naturalCompare(a.orderNumber, b.orderNumber)),
    maintenanceEvents: maintenanceEvents.sort(byTimeThenId('occurredAt')),
    incidents: incidents.sort(byTimeThenId('detectedAt')),
    machineDependencies: machineDependencies.sort(
      (a, b) => naturalCompare(codeOf(a.machineId), codeOf(b.machineId)) || naturalCompare(codeOf(a.dependsOnMachineId), codeOf(b.dependsOnMachineId)),
    ),
    plannedMachineEvents: [],
    appliedActions: [],
    warnings,
  }
}

export function assertEngineState(factoryState) {
  if (!isPlainObject(factoryState) || factoryState.engineStateVersion !== ENGINE_STATE_VERSION) {
    throw new EngineValidationError('Expected a factory state produced by normalizeFactoryState()')
  }
}

export function cloneFactoryState(factoryState) {
  return structuredClone(factoryState)
}

function checkReferences(collections, issues) {
  const { machines, productionLines, machineLineAssignments, orders, maintenanceEvents, incidents, machineDependencies } = collections

  const requireUnique = (items, key, label) => {
    const seen = new Set()
    for (const item of items) {
      if (seen.has(item[key])) issues.push(`duplicate ${label} "${item[key]}"`)
      seen.add(item[key])
    }
  }
  requireUnique(machines, 'id', 'machine id')
  requireUnique(machines, 'code', 'machine code')
  requireUnique(productionLines, 'id', 'production line id')
  requireUnique(productionLines, 'code', 'production line code')
  requireUnique(machineLineAssignments, 'id', 'assignment id')
  requireUnique(orders, 'id', 'order id')
  requireUnique(orders, 'orderNumber', 'order number')
  requireUnique(maintenanceEvents, 'id', 'maintenance event id')
  requireUnique(incidents, 'id', 'incident id')
  requireUnique(machineDependencies, 'id', 'dependency id')

  const machineIds = new Set(machines.map((machine) => machine.id))
  const lineIds = new Set(productionLines.map((line) => line.id))
  const requireMachine = (id, path) => {
    if (!machineIds.has(id)) issues.push(`${path} references unknown machine "${id}"`)
  }

  const assignmentPairs = new Set()
  machineLineAssignments.forEach((assignment, index) => {
    requireMachine(assignment.machineId, `machineLineAssignments[${index}]`)
    if (!lineIds.has(assignment.productionLineId)) {
      issues.push(`machineLineAssignments[${index}] references unknown production line "${assignment.productionLineId}"`)
    }
    const pair = `${assignment.machineId}|${assignment.productionLineId}`
    if (assignmentPairs.has(pair)) issues.push(`machineLineAssignments[${index}] duplicates a machine/line pair`)
    assignmentPairs.add(pair)
  })
  orders.forEach((order, index) => {
    if (!lineIds.has(order.productionLineId)) {
      issues.push(`orders[${index}] (${order.orderNumber}) references unknown production line "${order.productionLineId}"`)
    }
  })
  maintenanceEvents.forEach((event, index) => requireMachine(event.machineId, `maintenanceEvents[${index}]`))
  incidents.forEach((incident, index) => requireMachine(incident.machineId, `incidents[${index}]`))

  const dependencyPairs = new Set()
  machineDependencies.forEach((dependency, index) => {
    requireMachine(dependency.machineId, `machineDependencies[${index}]`)
    requireMachine(dependency.dependsOnMachineId, `machineDependencies[${index}]`)
    if (dependency.machineId === dependency.dependsOnMachineId) {
      issues.push(`machineDependencies[${index}] makes a machine depend on itself`)
    }
    const pair = `${dependency.machineId}|${dependency.dependsOnMachineId}`
    if (dependencyPairs.has(pair)) issues.push(`machineDependencies[${index}] duplicates a dependency`)
    dependencyPairs.add(pair)
  })
  if (issues.length > 0) return

  const sortedIds = [...machines].sort((a, b) => naturalCompare(a.code, b.code)).map((machine) => machine.id)
  const edges = machineDependencies
    .filter((dependency) => CONSTRAINING_DEPENDENCY_TYPES.includes(dependency.dependencyType))
    .map((dependency) => [dependency.dependsOnMachineId, dependency.machineId])
  const { cyclic } = topologicalOrder(sortedIds, edges)
  if (cyclic.length > 0) {
    const codes = machines.filter((machine) => cyclic.includes(machine.id)).map((machine) => machine.code)
    issues.push(`machine dependencies form a cycle involving ${codes.join(', ')}`)
  }
}

function rowReader(row, path, issues) {
  const valid = isPlainObject(row)
  if (!valid) issues.push(`${path} must be an object`)
  const at = (key) => `${path}.${key}`
  const missing = (value) => value === null || value === undefined || value === ''

  return {
    text(key, { required = true, allowed } = {}) {
      const value = valid ? row[key] : undefined
      if (missing(value)) {
        if (required && valid) issues.push(`${at(key)} is required`)
        return null
      }
      if (typeof value !== 'string') {
        issues.push(`${at(key)} must be a string`)
        return null
      }
      if (allowed && !allowed.includes(value)) {
        issues.push(`${at(key)} "${value}" must be one of: ${allowed.join(', ')}`)
        return null
      }
      return value
    },
    number(key, { required = true, min = 0 } = {}) {
      let value = valid ? row[key] : undefined
      if (missing(value)) {
        if (required && valid) issues.push(`${at(key)} is required`)
        return null
      }
      // PostgREST can return numeric columns as strings.
      if (typeof value === 'string') value = Number(value)
      if (!isFiniteNumber(value)) {
        issues.push(`${at(key)} must be a finite number`)
        return null
      }
      if (value < min) {
        issues.push(`${at(key)} must be >= ${min}`)
        return null
      }
      return value
    },
    timestamp(key, { required = true } = {}) {
      const value = valid ? row[key] : undefined
      if (missing(value)) {
        if (required && valid) issues.push(`${at(key)} is required`)
        return null
      }
      const ms = parseTimestamp(value)
      if (ms === null) {
        issues.push(`${at(key)} must be a valid timestamp`)
        return null
      }
      return new Date(ms).toISOString()
    },
    boolean(key, fallback) {
      const value = valid ? row[key] : undefined
      if (missing(value)) return fallback
      if (typeof value !== 'boolean') {
        issues.push(`${at(key)} must be a boolean`)
        return fallback
      }
      return value
    },
  }
}
