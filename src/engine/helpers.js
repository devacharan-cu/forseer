export const HOUR_MS = 3_600_000
export const DAY_MS = 86_400_000

// Tolerance for floating-point comparisons of hours and ratios.
export const TINY = 1e-9

export function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function round(value, decimals = 2) {
  if (value === null || value === undefined) return null
  const factor = 10 ** decimals
  const rounded = Math.round(value * factor) / factor
  return rounded === 0 ? 0 : rounded
}

export function sum(values) {
  let total = 0
  for (const value of values) total += value
  return total
}

export function maxOrNull(current, candidate) {
  if (candidate === null) return current
  if (current === null) return candidate
  return Math.max(current, candidate)
}

const CHUNK_PATTERN = /\d+|\D+/g
const DIGITS_PATTERN = /^\d+$/

// Locale-independent "natural" ordering so M2 sorts before M10 on every machine.
export function naturalCompare(a, b) {
  const left = String(a).match(CHUNK_PATTERN) ?? []
  const right = String(b).match(CHUNK_PATTERN) ?? []
  const length = Math.min(left.length, right.length)
  for (let i = 0; i < length; i += 1) {
    const x = left[i]
    const y = right[i]
    if (x === y) continue
    if (DIGITS_PATTERN.test(x) && DIGITS_PATTERN.test(y)) {
      const difference = Number(x) - Number(y)
      if (difference !== 0) return difference < 0 ? -1 : 1
      return x.length < y.length ? -1 : 1
    }
    return x < y ? -1 : 1
  }
  if (left.length === right.length) return 0
  return left.length < right.length ? -1 : 1
}

export function indexById(items) {
  return new Map(items.map((item) => [item.id, item]))
}

export function groupBy(items, keyOf) {
  const groups = new Map()
  for (const item of items) {
    const key = keyOf(item)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(item)
  }
  return groups
}

export function parseTimestamp(value) {
  if (value instanceof Date) {
    const ms = value.getTime()
    return Number.isNaN(ms) ? null : ms
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const ms = Date.parse(value)
    return Number.isNaN(ms) ? null : ms
  }
  return null
}

export function toIso(ms) {
  return new Date(Math.round(ms)).toISOString()
}

export function hoursBetween(fromMs, toMs) {
  return (toMs - fromMs) / HOUR_MS
}

export function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value)) deepFreeze(child)
  }
  return value
}
