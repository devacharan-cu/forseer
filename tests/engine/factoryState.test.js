import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { EngineValidationError, normalizeFactoryState } from '../../src/engine/index.js'
import { AS_OF, nova01State, smallFactoryRows } from './support.js'

describe('normalizeFactoryState', () => {
  it('converts database rows into the engine state model', () => {
    const state = normalizeFactoryState(smallFactoryRows(), { asOf: AS_OF })
    const ma = state.machines.find((machine) => machine.id === 'MA')
    assert.equal(state.asOf, AS_OF)
    assert.equal(ma.machineType, 'Press')
    assert.equal(ma.baselineState, 'healthy')
    assert.equal(ma.stageNominalPerHour, 60)
    assert.equal(state.productionLines[0].nominalCapacityPerHour, 120)
    assert.deepEqual(state.plannedMachineEvents, [])
    assert.deepEqual(state.warnings, [])
  })

  it('orders machines naturally so M2 comes before M10', () => {
    const codes = nova01State().machines.map((machine) => machine.code)
    assert.deepEqual(codes, ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10', 'M11', 'M12'])
  })

  it('maps database status/health vocabulary to engine machine states', () => {
    const rows = smallFactoryRows({
      machineOverrides: {
        MA: { status: 'operational', health_state: 'at_risk' },
        MB: { status: 'down' },
        MC: { status: 'operational', health_state: 'watch' },
      },
    })
    const states = Object.fromEntries(normalizeFactoryState(rows, { asOf: AS_OF }).machines.map((m) => [m.id, m.baselineState]))
    assert.deepEqual(states, { MA: 'at_risk', MB: 'failed', MC: 'monitoring' })
  })

  it('accepts numeric columns returned as strings', () => {
    const rows = smallFactoryRows()
    rows.machines[0].capacity_per_hour = '60'
    const state = normalizeFactoryState(rows, { asOf: AS_OF })
    assert.equal(state.machines[0].capacityPerHour, 60)
  })

  it('requires an explicit asOf instead of reading the clock', () => {
    assert.throws(() => normalizeFactoryState(smallFactoryRows()), EngineValidationError)
    assert.throws(() => normalizeFactoryState(smallFactoryRows(), { asOf: 'not a date' }), /asOf/)
  })

  it('rejects rows that break the schema vocabulary or constraints', () => {
    const badStatus = smallFactoryRows()
    badStatus.machines[0].status = 'exploded'
    assert.throws(() => normalizeFactoryState(badStatus, { asOf: AS_OF }), /status "exploded"/)

    const negative = smallFactoryRows()
    negative.machines[0].capacity_per_hour = -5
    assert.throws(() => normalizeFactoryState(negative, { asOf: AS_OF }), /capacity_per_hour must be >= 0/)
  })

  it('rejects references to unknown machines and lines', () => {
    const rows = smallFactoryRows()
    rows.orders[0].production_line_id = 'NOPE'
    assert.throws(() => normalizeFactoryState(rows, { asOf: AS_OF }), /unknown production line "NOPE"/)
  })

  it('rejects circular machine dependencies', () => {
    const dependency = (id, machine, upstream) => ({ id, machine_id: machine, depends_on_machine_id: upstream, dependency_type: 'sequential' })
    const rows = smallFactoryRows({ dependencies: [dependency('d1', 'MB', 'MA'), dependency('d2', 'MA', 'MB')] })
    assert.throws(() => normalizeFactoryState(rows, { asOf: AS_OF }), /cycle involving MA, MB/)
  })

  it('warns when a line capacity disagrees with its machine assignments', () => {
    const rows = smallFactoryRows()
    rows.productionLines[0].capacity_per_hour = 150
    const state = normalizeFactoryState(rows, { asOf: AS_OF })
    assert.equal(state.warnings[0].code, 'line_capacity_mismatch')
    assert.equal(state.productionLines[0].nominalCapacityPerHour, 120)
  })
})
