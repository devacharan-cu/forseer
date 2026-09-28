// Maps the codes a model writes (M4, LINE-2, ORD-0482) back to real records,
// and checks that the user actually mentioned what the model picked.

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function buildReferenceIndex(factoryState) {
  return {
    machines: new Map(factoryState.machines.map((m) => [m.code.toUpperCase(), m])),
    machineNames: new Map(factoryState.machines.map((m) => [m.name.toLowerCase(), m])),
    lines: new Map(factoryState.productionLines.map((l) => [l.code.toUpperCase(), l])),
    orders: new Map(factoryState.orders.map((o) => [o.orderNumber.toUpperCase(), o])),
  }
}

export function lookupMachine(index, reference) {
  if (typeof reference !== 'string') return null
  return index.machines.get(reference.trim().toUpperCase()) ?? index.machineNames.get(reference.trim().toLowerCase()) ?? null
}

export function lookupLine(index, reference) {
  if (typeof reference !== 'string') return null
  const key = reference.trim().toUpperCase()
  return index.lines.get(key) ?? index.lines.get(key.replace(/^LINE\s*/, 'LINE-')) ?? null
}

export function lookupOrder(index, reference) {
  if (typeof reference !== 'string') return null
  const key = reference.trim().toUpperCase()
  if (index.orders.has(key)) return index.orders.get(key)
  const digits = key.match(/\d+/)?.[0]
  if (!digits) return null
  return [...index.orders.values()].find((o) => Number(o.orderNumber.match(/\d+/)?.[0]) === Number(digits)) ?? null
}

export function isMachineMentioned(text, machine) {
  return new RegExp(`\\b${escapeRegex(machine.code)}\\b`, 'i').test(text) || text.toLowerCase().includes(machine.name.toLowerCase())
}

export function isLineMentioned(text, line) {
  const number = line.code.match(/\d+/)?.[0]
  return (
    new RegExp(`\\b${escapeRegex(line.code)}\\b`, 'i').test(text) ||
    (number !== undefined && new RegExp(`\\bline\\s*-?\\s*0*${number}\\b`, 'i').test(text))
  )
}

export function isOrderMentioned(text, order) {
  const digits = order.orderNumber.match(/\d+/)?.[0]
  return (
    new RegExp(`\\b${escapeRegex(order.orderNumber)}\\b`, 'i').test(text) ||
    (digits !== undefined && new RegExp(`(?<![\\w-])#?0*${Number(digits)}\\b`).test(text))
  )
}
