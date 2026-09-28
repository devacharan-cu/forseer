// Prints the canonical NOVA-01 hero flow computed by the deterministic engine.
// Run with: npm run engine:demo
import { HERO_BREAKING_POINT_QUERY, HERO_SCENARIOS } from '../src/data/demoScenarios.js'
import { buildNova01Snapshot, NOVA01_IDS, NOVA01_REFERENCE_AS_OF } from '../src/data/nova01.js'
import {
  assessMachineRisk,
  compareScenarios,
  findBreakingPoint,
  findRecurringPatterns,
  normalizeFactoryState,
  simulateScenario,
} from '../src/engine/index.js'

const state = normalizeFactoryState(buildNova01Snapshot(NOVA01_REFERENCE_AS_OF), { asOf: NOVA01_REFERENCE_AS_OF })

const risk = assessMachineRisk(state, NOVA01_IDS.M4)
console.log(`\nM4 operational risk: ${risk.level} (${risk.points} points)`)
for (const signal of risk.signals) console.log(`  +${signal.points}  ${signal.signal}`)

const vibration = findRecurringPatterns(state, NOVA01_IDS.M4)[0]
console.log(
  `\nM4 history: "${vibration.matchedPattern}" in ${vibration.occurrences} incidents, ${vibration.occurrencesAfterLastRepair} after the last repair`,
)

const results = Object.values(HERO_SCENARIOS).map((scenario) => simulateScenario(state, scenario))
console.log('\nScenario                                         downtime  lost line-h  at-risk  breaches  2nd risks  ORD-0482')
for (const result of results) {
  const order = result.orderImpacts.find((impact) => impact.orderId === NOVA01_IDS.ORD_0482).scenario
  console.log(
    [
      result.scenarioName.padEnd(48),
      String(result.metrics.totalDowntimeHours).padStart(8),
      String(result.metrics.capacityLossLineHours).padStart(12),
      String(result.metrics.ordersAtRisk).padStart(8),
      String(result.metrics.deadlineBreaches).padStart(9),
      String(result.metrics.secondaryRisks).padStart(10),
      `  ${order.status} (slack ${order.slackHours} h)`,
    ].join(' '),
  )
}

console.log('\nCascade for "Do nothing":')
for (const link of results[0].cascade) {
  console.log(`  [${link.step}] ${link.sourceLabel} -> ${link.targetLabel}: ${link.impactType} ${link.magnitude ?? ''} ${link.unit}`)
}

const breakingPoint = findBreakingPoint(state, HERO_BREAKING_POINT_QUERY.scenarioTemplate, HERO_BREAKING_POINT_QUERY.parameter)
console.log(
  `\nBreaking point: ORD-0482 breaches once M4 downtime reaches ${breakingPoint.breakingPoint} h ` +
    `(still safe at ${breakingPoint.lastSafeValue} h; ${breakingPoint.precision} h precision, ${breakingPoint.evaluations} simulations)`,
)

const comparison = compareScenarios(results)
console.log(`\nCompared against "${comparison.referenceScenarioId}":`)
for (const difference of comparison.differences) console.log(' ', JSON.stringify(difference))
