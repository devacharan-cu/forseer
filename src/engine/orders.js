import { OPEN_ORDER_STATUSES, PRIORITY_RANK } from './constants.js'
import { HOUR_MS, naturalCompare, TINY, toIso } from './helpers.js'

export function isOpenOrder(order) {
  return OPEN_ORDER_STATUSES.includes(order.status)
}

// Earliest deadline first; priority breaks ties, then order number.
function compareQueue(a, b) {
  return (
    Date.parse(a.deadline) - Date.parse(b.deadline) ||
    PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] ||
    naturalCompare(a.orderNumber, b.orderNumber)
  )
}

export function queueOrdersForLine(orders, productionLineId) {
  return orders.filter((order) => order.productionLineId === productionLineId && isOpenOrder(order)).sort(compareQueue)
}

// Works through a line's queue one order at a time. `rates[i]` is how many
// nominal line-hours of work the line completes per hour during segments[i].
// Returns each order's completion time in hours after asOf, or null if the
// order does not finish within the simulated horizon.
export function completeQueue(queue, segments, rates) {
  const completions = new Array(queue.length).fill(null)
  let index = 0
  let remaining = queue.length > 0 ? queue[0].requiredProductionHours : 0

  for (let s = 0; s < segments.length && index < queue.length; s += 1) {
    const segment = segments[s]
    const rate = rates[s]
    let time = segment.start
    while (index < queue.length) {
      if (remaining <= TINY) {
        completions[index] = time
        index += 1
        remaining = index < queue.length ? queue[index].requiredProductionHours : 0
        continue
      }
      if (rate <= TINY) break
      const hoursNeeded = remaining / rate
      if (time + hoursNeeded <= segment.end + TINY) {
        time += hoursNeeded
        remaining = 0
      } else {
        remaining -= (segment.end - time) * rate
        break
      }
    }
  }
  return completions
}

export function scheduleOrders(factoryState, segments, snapshots, config) {
  const operatingFraction = config.operatingHoursPerDay / 24
  const results = new Map()
  for (const line of factoryState.productionLines) {
    const queue = queueOrdersForLine(factoryState.orders, line.id)
    const rates = snapshots.map((snapshot) => snapshot.lines.get(line.id).ratio * operatingFraction)
    const completions = completeQueue(queue, segments, rates)
    queue.forEach((order, position) => {
      results.set(order.id, { completionHours: completions[position], queuePosition: position + 1 })
    })
  }
  return results
}

export function deadlineStatusFor(slackHours, config) {
  const { criticalSlackHours, warningSlackHours } = config.deadlineThresholds
  if (slackHours < -TINY) return 'BREACHED'
  if (slackHours < criticalSlackHours - TINY) return 'CRITICAL'
  if (slackHours < warningSlackHours - TINY) return 'WARNING'
  return 'SAFE'
}

export function evaluateOrderOutcome(order, completionHours, asOfMs, config) {
  const deadlineHours = (Date.parse(order.deadline) - asOfMs) / HOUR_MS
  if (completionHours === null) {
    return {
      deadline: order.deadline,
      deadlineHours,
      completionHours: null,
      completionAt: null,
      slackHours: null,
      status: 'BREACHED',
      canComplete: false,
    }
  }
  const slackHours = deadlineHours - completionHours
  return {
    deadline: order.deadline,
    deadlineHours,
    completionHours,
    completionAt: toIso(asOfMs + completionHours * HOUR_MS),
    slackHours,
    status: deadlineStatusFor(slackHours, config),
    canComplete: true,
  }
}
