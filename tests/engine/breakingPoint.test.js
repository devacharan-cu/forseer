import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { EngineValidationError, findBreakingPoint } from '../../src/engine/index.js'
import { failure, order, smallFactory } from './support.js'

// O1 has 16 h of slack and MA's failure costs 0.5 line-hours per hour,
// so O1 breaches once MA is down for more than 32 h.
const template = { id: 'ma-down', machineEvents: [failure('MA', 1)] }
const breachO1 = { type: 'order_status_at_least', orderId: 'O1', status: 'BREACHED' }
const parameter = (overrides = {}) => ({ name: 'durationHours', eventIndex: 0, min: 0, max: 72, step: 1, precision: 0.1, condition: breachO1, ...overrides })

describe('findBreakingPoint', () => {
  it('finds the first downtime at which the order breaches, at the stated precision', () => {
    const result = findBreakingPoint(smallFactory(), template, parameter())
    assert.equal(result.found, true)
    assert.equal(result.breakingPoint, 32.1)
    assert.equal(result.lastSafeValue, 32)
    assert.equal(result.precision, 0.1)
    assert.deepEqual(result.coarse, { step: 1, previousSafeValue: 32, firstUnsafeValue: 33 })
    assert.equal(result.observedAtBreakingPoint.status, 'BREACHED')
    assert.equal(result.observedAtLastSafeValue.status, 'CRITICAL')
    assert.equal(result.affectedEntity, 'O1')
    assert.equal(result.machineCode, 'MA')
  })

  it('reports whole-hour precision when asked for it', () => {
    const result = findBreakingPoint(smallFactory(), template, parameter({ precision: 1 }))
    assert.equal(result.breakingPoint, 33)
    assert.equal(result.lastSafeValue, 32)
  })

  it('finds an earlier threshold for a less severe condition', () => {
    // CRITICAL means slack < 4 h, i.e. more than 24 h of downtime.
    const result = findBreakingPoint(smallFactory(), template, parameter({ condition: { ...breachO1, status: 'CRITICAL' } }))
    assert.equal(result.breakingPoint, 24.1)
  })

  it('supports "any new deadline breach" as the condition', () => {
    const result = findBreakingPoint(smallFactory(), template, parameter({ condition: { type: 'any_new_deadline_breach' } }))
    assert.equal(result.breakingPoint, 32.1)
    assert.equal(result.affectedEntity, 'any_open_order')
  })

  it('says so when nothing breaks within the range', () => {
    const result = findBreakingPoint(smallFactory(), template, parameter({ max: 10 }))
    assert.equal(result.found, false)
    assert.equal(result.reason, 'no_breaking_point_in_range')
    assert.equal(result.breakingPoint, null)
    assert.equal(result.lastSafeValue, 10)
  })

  it('says so when the condition already holds at the minimum (already breached at zero)', () => {
    const state = smallFactory({ orders: [order('LATE', 5, -2, { status: 'late' }), order('O1', 24, 40)] })
    const result = findBreakingPoint(state, template, parameter({ condition: { ...breachO1, orderId: 'LATE' } }))
    assert.equal(result.found, false)
    assert.equal(result.reason, 'unsafe_at_minimum')
    assert.equal(result.observedAtMinimum.status, 'BREACHED')
  })

  it('rejects invalid ranges and parameters', () => {
    const state = smallFactory()
    const invalid = [
      parameter({ min: 10, max: 5 }),
      parameter({ min: -1 }),
      parameter({ step: 0 }),
      parameter({ precision: 2 }),
      parameter({ max: 5000 }),
      parameter({ name: 'startHours' }),
      parameter({ eventIndex: 3 }),
      parameter({ condition: { type: 'vibes' } }),
      parameter({ condition: { ...breachO1, orderId: 'NOPE' } }),
      parameter({ condition: { ...breachO1, status: 'SAFE' } }),
    ]
    for (const bad of invalid) assert.throws(() => findBreakingPoint(state, template, bad), EngineValidationError)
  })

  it('rejects an impossible scenario template', () => {
    assert.throws(() => findBreakingPoint(smallFactory(), { id: 'x', machineEvents: [failure('NOPE', 1)] }, parameter()), EngineValidationError)
  })

  it('is deterministic', () => {
    assert.deepEqual(findBreakingPoint(smallFactory(), template, parameter()), findBreakingPoint(smallFactory(), template, parameter()))
  })
})
