import { naturalCompare, round } from './helpers.js'
import { EngineValidationError, throwIfIssues } from './validation.js'

// Every compared metric is "lower means less operational impact".
const COMPARED_METRICS = [
  'totalDowntimeHours',
  'capacityLossLineHours',
  'ordersAtRisk',
  'deadlineBreaches',
  'newDeadlineBreaches',
  'secondaryRisks',
  'machinesAffected',
  'linesAffected',
  'ordersAffected',
]

// Lays scenario results side by side. It reports differences only; choosing
// between trade-offs (e.g. fewer breaches vs. a new secondary risk) is left to
// the person or the AI layer explaining these numbers.
export function compareScenarios(results) {
  if (!Array.isArray(results) || results.length < 2) {
    throw new EngineValidationError('compareScenarios needs an array of at least two scenario results')
  }
  const issues = []
  const ids = new Set()
  results.forEach((result, index) => {
    if (typeof result?.scenarioId !== 'string' || typeof result.metrics !== 'object' || !Array.isArray(result.orderImpacts)) {
      issues.push(`results[${index}] is not a scenario result from simulateScenario()`)
      return
    }
    if (ids.has(result.scenarioId)) issues.push(`results[${index}] repeats scenarioId "${result.scenarioId}"`)
    ids.add(result.scenarioId)
    if (result.asOf !== results[0].asOf) issues.push(`results[${index}] was simulated from a different asOf snapshot`)
  })
  throwIfIssues('Invalid scenario results', issues)

  const reference = results[0]
  const metrics = COMPARED_METRICS.map((metric) => {
    const values = results.map((result) => ({ scenarioId: result.scenarioId, value: result.metrics[metric] }))
    const lowest = Math.min(...values.map((entry) => entry.value))
    return {
      metric,
      values,
      deltasFromReference: results.map((result) => ({
        scenarioId: result.scenarioId,
        delta: round(result.metrics[metric] - reference.metrics[metric], 2),
      })),
      lowestValueScenarioIds: values.filter((entry) => entry.value === lowest).map((entry) => entry.scenarioId),
    }
  })

  const delta = (result, metric) => round(result.metrics[metric] - reference.metrics[metric], 2)
  const differences = results.slice(1).map((result) => ({
    scenarioId: result.scenarioId,
    referenceScenarioId: reference.scenarioId,
    downtimeHours: delta(result, 'totalDowntimeHours'),
    capacityLossLineHours: delta(result, 'capacityLossLineHours'),
    ordersAtRisk: delta(result, 'ordersAtRisk'),
    deadlineBreaches: delta(result, 'deadlineBreaches'),
    secondaryRisks: delta(result, 'secondaryRisks'),
  }))

  const orderIds = new Map()
  for (const result of results) {
    for (const impact of result.orderImpacts) orderIds.set(impact.orderId, impact.orderNumber)
  }
  const orders = [...orderIds]
    .sort((a, b) => naturalCompare(a[1], b[1]))
    .map(([orderId, orderNumber]) => {
      const outcomes = results.map((result) => {
        const impact = result.orderImpacts.find((entry) => entry.orderId === orderId)
        return {
          scenarioId: result.scenarioId,
          status: impact?.scenario.status ?? null,
          completionHours: impact?.scenario.completionHours ?? null,
          slackHours: impact?.scenario.slackHours ?? null,
        }
      })
      const differs = outcomes.some(
        (outcome) => outcome.status !== outcomes[0].status || outcome.completionHours !== outcomes[0].completionHours,
      )
      return { orderId, orderNumber, differs, outcomes }
    })
    .filter((order) => order.differs)

  return {
    referenceScenarioId: reference.scenarioId,
    scenarioIds: results.map((result) => result.scenarioId),
    metrics,
    differences,
    orders,
    note: 'No scenario is ranked. For every metric a lower value means less operational impact; trade-offs between metrics are not weighed here.',
  }
}
