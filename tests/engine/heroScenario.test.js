import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { HERO_BREAKING_POINT_QUERY, HERO_SCENARIOS } from '../../src/data/demoScenarios.js'
import { NOVA01_IDS } from '../../src/data/nova01.js'
import { assessMachineRisk, compareScenarios, findBreakingPoint, simulateScenario } from '../../src/engine/index.js'
import { nova01State, orderOutcome } from './support.js'

// Canonical BEFORE-mode flow on NOVA-01:
// M4 elevated risk -> hypothetical failure -> Line 2 impact -> ORD-0482 deadline risk
// -> preventive / recovery alternatives -> measurable difference.
describe('NOVA-01 hero flow', () => {
  const state = nova01State()
  const run = (key) => simulateScenario(state, HERO_SCENARIOS[key])
  const ord0482 = (result) => orderOutcome(result, NOVA01_IDS.ORD_0482)

  it('starts from M4 at elevated risk and ORD-0482 already on a WARNING', () => {
    assert.equal(assessMachineRisk(state, NOVA01_IDS.M4).level, 'CRITICAL')
    const baseline = ord0482(run('doNothing')).baseline
    assert.equal(baseline.status, 'WARNING')
    assert.equal(baseline.slackHours, 10)
  })

  it('do nothing: M4 failure cascades through Line 2 and breaches ORD-0482', () => {
    const result = run('doNothing')
    assert.equal(ord0482(result).scenario.status, 'BREACHED')
    assert.equal(ord0482(result).scenario.slackHours, -3.18)
    assert.deepEqual(
      {
        downtime: result.metrics.totalDowntimeHours,
        lost: result.metrics.capacityLossLineHours,
        newBreaches: result.metrics.newDeadlineBreaches,
        atRisk: result.metrics.ordersAtRisk,
      },
      { downtime: 16, lost: 13.18, newBreaches: 1, atRisk: 2 },
    )

    const chain = (step, source, target, impactType) =>
      result.cascade.some((link) => link.step === step && link.sourceLabel === source && link.targetLabel === target && link.impactType === impactType)
    assert.ok(chain(0, 'M4 unplanned failure', 'M4', 'state_change'))
    assert.ok(chain(1, 'M4', 'M5', 'upstream_starvation'))
    assert.ok(chain(1, 'M5', 'M6', 'upstream_starvation'))
    assert.ok(chain(2, 'M4', 'LINE-2', 'capacity_reduction'))
    assert.ok(chain(3, 'LINE-2', 'ORD-0482', 'completion_delay'))
    assert.ok(chain(4, 'ORD-0482', 'ORD-0482', 'deadline_status_change'))

    // Per-machine shares of the line loss add up to the line loss.
    const shares = result.cascade.filter((link) => link.step === 2).reduce((total, link) => total + link.magnitude, 0)
    assert.ok(Math.abs(shares - result.metrics.capacityLossLineHours) < 0.02)
  })

  it('preventive maintenance: short planned outage, no new breach', () => {
    const result = run('preventiveMaintenance')
    assert.equal(ord0482(result).scenario.status, 'WARNING')
    assert.equal(ord0482(result).scenario.slackHours, 7.94)
    assert.equal(result.metrics.newDeadlineBreaches, 0)
    assert.equal(result.metrics.totalDowntimeHours, 2.5)
  })

  it('reroute to M7: avoids the breach but turns M7 into a secondary risk', () => {
    const result = run('failureWithRerouteToM7')
    assert.equal(ord0482(result).scenario.status, 'CRITICAL')
    assert.equal(ord0482(result).scenario.slackHours, 1.22)
    assert.deepEqual(result.resourceImpacts.map((risk) => [risk.code, risk.riskType, risk.scenarioPeakUtilization, risk.coveringForCodes]), [
      ['M7', 'high_utilization', 1, ['M4']],
    ])
    assert.ok(result.cascade.some((link) => link.impactType === 'secondary_high_utilization' && link.sourceLabel === 'M4' && link.targetLabel === 'M7'))
  })

  it('load reduction: no downtime or capacity loss, but M7 runs at its limit', () => {
    const result = run('loadReduction')
    assert.equal(result.metrics.totalDowntimeHours, 0)
    assert.equal(result.metrics.capacityLossLineHours, 0)
    assert.equal(result.metrics.ordersAffected, 0)
    assert.equal(result.metrics.secondaryRisks, 1)
  })

  it('the comparison measures the difference between the futures', () => {
    const results = ['doNothing', 'preventiveMaintenance', 'failureWithRerouteToM7', 'loadReduction'].map(run)
    const comparison = compareScenarios(results)
    const byId = Object.fromEntries(comparison.differences.map((difference) => [difference.scenarioId, difference]))
    assert.equal(byId['hero-preventive-maintenance'].deadlineBreaches, -1)
    assert.equal(byId['hero-preventive-maintenance'].downtimeHours, -13.5)
    assert.equal(byId['hero-reroute-to-m7'].secondaryRisks, 1)
    const order = comparison.orders.find((entry) => entry.orderNumber === 'ORD-0482')
    assert.deepEqual(order.outcomes.map((outcome) => outcome.status), ['BREACHED', 'WARNING', 'CRITICAL', 'WARNING'])
  })

  it('finds how long M4 can be down before ORD-0482 breaches', () => {
    const { scenarioTemplate, parameter } = HERO_BREAKING_POINT_QUERY
    const result = findBreakingPoint(state, scenarioTemplate, parameter)
    // 10 h of slack / (210/255 line-hours lost per hour of M4 downtime) = 12.14 h
    assert.equal(result.found, true)
    assert.equal(result.lastSafeValue, 12.1)
    assert.equal(result.breakingPoint, 12.2)
    assert.equal(result.affectedEntity, 'ORD-0482')
  })
})
