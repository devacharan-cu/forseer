import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { lineId, machineId, NOVA01_SEED_TABLES, orderId } from '../../src/data/nova01.js'

// The engine fixture must describe the same factory as supabase/seed.sql,
// otherwise tests would pass against data the real database doesn't contain.
const seed = readFileSync(new URL('../../supabase/seed.sql', import.meta.url), 'utf8')
const matchAll = (pattern) => [...seed.matchAll(pattern)].map((match) => match.slice(1))
const signed = (sign, days) => (sign === '-' ? -Number(days) : Number(days))

describe('NOVA-01 fixture matches supabase/seed.sql', () => {
  it('machines', () => {
    const rows = matchAll(
      /\('(b0000000-[^']+)', '(M\d+)', '([^']+)', '([^']+)', '(\w+)', '(\w+)', ([\d.]+), (\d+), now\(\) - interval '(\d+) days'\)/g,
    )
    const fromSeed = rows.map(([id, code, name, type, , health, capacity, interval, daysAgo]) => [id, code, name, type, health, Number(capacity), Number(interval), Number(daysAgo)])
    const fromFixture = NOVA01_SEED_TABLES.MACHINES.map(([n, name, type, health, capacity, interval, daysAgo]) => [machineId(n), `M${n}`, name, type, health, capacity, interval, daysAgo])
    assert.deepEqual(fromSeed, fromFixture)
  })

  it('machine-line assignments', () => {
    const rows = matchAll(/\('(b0000000-[^']+)', '(a0000000-[^']+)', ([\d.]+), (true|false)\)/g)
    const fromSeed = rows.map(([m, l, contribution]) => [m, l, Number(contribution)])
    const fromFixture = NOVA01_SEED_TABLES.ASSIGNMENTS.map(([m, l, contribution]) => [machineId(m), lineId(l), contribution])
    assert.deepEqual(fromSeed, fromFixture)
  })

  it('orders', () => {
    const rows = matchAll(
      /\('(c0000000-[^']+)', '(ORD-\d+)', '(a0000000-[^']+)', (\d+), ([\d.]+), '(\w+)', now\(\) ([+-]) interval '(\d+) days', '(\w+)'\)/g,
    )
    const fromSeed = rows.map(([id, number, line, quantity, hours, priority, sign, days, status]) => [id, number, line, Number(quantity), Number(hours), priority, signed(sign, days), status])
    const fromFixture = NOVA01_SEED_TABLES.ORDERS.map(([number, l, quantity, hours, priority, days, status]) => [orderId(number), number, lineId(l), quantity, hours, priority, days, status])
    assert.deepEqual(fromSeed, fromFixture)
  })

  it('maintenance events and incidents', () => {
    const maintenanceCount = matchAll(/\('b0000000-[^']+', '(inspection|preventive|repair|emergency|calibration)'/g).length
    assert.equal(maintenanceCount, NOVA01_SEED_TABLES.MAINTENANCE_EVENTS.length)
    const incidentDescriptions = matchAll(/\('b0000000-[^']+', '([^']+)', '(?:low|medium|high|critical)', '/g).map(([text]) => text)
    assert.deepEqual(incidentDescriptions, NOVA01_SEED_TABLES.INCIDENTS.map(([, description]) => description))
  })

  it('every machine last_maintenance_at matches its latest maintenance event', () => {
    for (const [n, , , , , , lastDaysAgo] of NOVA01_SEED_TABLES.MACHINES) {
      const events = NOVA01_SEED_TABLES.MAINTENANCE_EVENTS.filter(([m]) => m === n).map(([, , , daysAgo]) => daysAgo)
      assert.equal(Math.min(...events), lastDaysAgo, `M${n}`)
    }
  })
})
