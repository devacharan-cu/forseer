import { flowOrder } from '../factory/model.js'
import { MACHINE_MODELS, modelKeyForType } from './modelRegistry.js'

const MACHINE_GAP = 1.6
const ROW_GAP = 9
const CONSTRAINING = ['sequential', 'shared_resource']

// Places every machine on the floor from the data alone: one row per production
// line, machines in the order work flows through them (sequential dependencies),
// conveyors only where a real dependency connects two neighbours.
export function computeFactoryLayout(state) {
  const lines = [...state.productionLines]
  const placedIds = new Set()
  const rows = []
  const machines = []
  const conveyors = []

  lines.forEach((line, lineIndex) => {
    const onLine = state.machineLineAssignments
      .filter((a) => a.productionLineId === line.id && a.coversMachineId === null)
      .map((a) => state.machines.find((m) => m.id === a.machineId))
      .filter((machine) => machine && !placedIds.has(machine.id))
    const ordered = flowOrder(state, onLine)
    const z = (lineIndex - (lines.length - 1) / 2) * ROW_GAP

    let cursor = 0
    const placements = ordered.map((machine) => {
      const modelKey = modelKeyForType(machine.machineType)
      const model = MACHINE_MODELS[modelKey]
      const x = cursor - model.x[0]
      cursor = x + model.x[1] + MACHINE_GAP
      placedIds.add(machine.id)
      return { machine, modelKey, model, x }
    })
    const rowWidth = Math.max(cursor - MACHINE_GAP, 0)
    const offset = -rowWidth / 2

    for (const p of placements) {
      machines.push({
        id: p.machine.id,
        code: p.machine.code,
        lineId: line.id,
        modelKey: p.modelKey,
        url: p.model.url,
        position: [p.x + offset, 0, z],
        extents: { x: [p.x + offset + p.model.x[0], p.x + offset + p.model.x[1]], z: [z + p.model.z[0], z + p.model.z[1]] },
        height: p.model.height,
      })
    }

    for (let i = 1; i < placements.length; i++) {
      const upstream = placements[i - 1]
      const downstream = placements[i]
      const linked = state.machineDependencies.some(
        (d) =>
          CONSTRAINING.includes(d.dependencyType) &&
          d.machineId === downstream.machine.id &&
          d.dependsOnMachineId === upstream.machine.id,
      )
      const from = upstream.x + upstream.model.x[1] + offset + 0.1
      const to = downstream.x + downstream.model.x[0] + offset - 0.1
      if (linked && to - from > 0.3) {
        conveyors.push({ id: `${upstream.machine.id}->${downstream.machine.id}`, from: [from, 0, z], to: [to, 0, z], length: to - from })
      }
    }

    rows.push({ id: line.id, code: line.code, name: line.name, z, xStart: offset, xEnd: offset + rowWidth })
  })

  // Machines not assigned to any line still appear, on their own row.
  const unplaced = state.machines.filter((m) => !placedIds.has(m.id))
  if (unplaced.length > 0) {
    const z = (lines.length - (lines.length - 1) / 2) * ROW_GAP
    let cursor = 0
    for (const machine of unplaced) {
      const modelKey = modelKeyForType(machine.machineType)
      const model = MACHINE_MODELS[modelKey]
      const x = cursor - model.x[0]
      cursor = x + model.x[1] + MACHINE_GAP
      machines.push({
        id: machine.id,
        code: machine.code,
        lineId: null,
        modelKey,
        url: model.url,
        position: [x, 0, z],
        extents: { x: [x + model.x[0], x + model.x[1]], z: [z + model.z[0], z + model.z[1]] },
        height: model.height,
      })
    }
  }

  const xs = machines.flatMap((m) => m.extents.x)
  const zs = machines.flatMap((m) => m.extents.z)
  const bounds = machines.length
    ? { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) }
    : { minX: -5, maxX: 5, minZ: -5, maxZ: 5 }

  return { rows, machines, conveyors, bounds, props: propPlacements(rows, machines, bounds) }
}

// Set dressing only: tool carts at the head of each line, extinguishers at the
// end, a run of shelving along the back of the floor.
function propPlacements(rows, machines, bounds) {
  const props = []
  rows.forEach((row, index) => {
    props.push({ kind: 'toolCart', position: [row.xStart - 1.5, 0, row.z - 2.1], rotationY: 0 })
    props.push({ kind: 'extinguisher', position: [row.xEnd + 1.6, 0, row.z - 1.2], rotationY: -Math.PI / 2 })
    if (index % 2 === 0) props.push({ kind: 'toolChest', position: [row.xEnd + 1.8, 0, row.z + 1.4], rotationY: -Math.PI / 2 })
    else props.push({ kind: 'storageCart', position: [row.xEnd + 2.2, 0, row.z + 1.2], rotationY: -Math.PI / 2 })
  })
  const backZ = bounds.minZ - 2.6
  for (let x = bounds.minX + 0.6; x < bounds.maxX; x += 1.25) props.push({ kind: 'shelves', position: [x, 0, backZ], rotationY: 0 })
  for (const [dx, dz] of [[0, 0], [0.7, 0.1], [0.35, 0.65]]) props.push({ kind: 'barrel', position: [bounds.maxX + 2.4 + dx, 0, bounds.maxZ + 1.4 + dz], rotationY: dx })
  for (const machine of machines) {
    if (machine.modelKey === 'welding-robot') {
      props.push({ kind: 'weldingCart', position: [machine.extents.x[0] - 0.9, 0, machine.position[2] - 0.6], rotationY: Math.PI / 2 })
    }
  }
  return props
}
