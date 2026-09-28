// Guards against the model inventing figures or overclaiming.
//
// Every number written in AI text must already exist in the facts the engine
// produced (or in the user's own words). Identifiers such as M4, LINE-2 and
// ORD-0482 are not treated as figures.

const WORD_NUMBERS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, hundred: 100,
}

const NUMBER_PATTERN = /\d+(?:\.\d+)?/g
const IDENTIFIER_CHAR = /[A-Za-z0-9_.]/

const keyOf = (value) => String(Math.round(Math.abs(value) * 100) / 100)

// Figures written in free text, ignoring digits that are part of identifiers or dates' later parts.
export function numbersInText(text) {
  const clean = String(text).replace(/(\d),(?=\d{3}\b)/g, '$1')
  const numbers = []
  for (const match of clean.matchAll(NUMBER_PATTERN)) {
    const before = clean[match.index - 1] ?? ''
    const twoBefore = clean[match.index - 2] ?? ''
    if (IDENTIFIER_CHAR.test(before)) continue
    if (before === '-' && /[A-Za-z0-9]/.test(twoBefore)) continue
    numbers.push(Number(match[0]))
  }
  for (const word of clean.toLowerCase().match(/[a-z]+/g) ?? []) {
    if (word in WORD_NUMBERS) numbers.push(WORD_NUMBERS[word])
  }
  return numbers
}

// Everything a user might reasonably mean by the figures in their own words:
// "for 2 days" -> 48 h, "half a day" -> 12 h, "30%" -> 0.3.
export function numbersImpliedByUserText(text) {
  const lower = String(text).toLowerCase()
  const numbers = numbersInText(text)
  for (const match of lower.matchAll(/(\d+(?:\.\d+)?)\s*(day|days|week|weeks|minutes|mins|min)\b/g)) {
    const value = Number(match[1])
    if (match[2].startsWith('day')) numbers.push(value * 24)
    else if (match[2].startsWith('week')) numbers.push(value * 168)
    else numbers.push(value / 60)
  }
  for (const match of lower.matchAll(/(\d+(?:\.\d+)?)\s*(%|percent)/g)) numbers.push(Number(match[1]) / 100)
  if (/\bhalf (?:a )?day\b/.test(lower)) numbers.push(12)
  if (/\b(?:a|one) day\b/.test(lower)) numbers.push(24)
  if (/\b(?:a|one) week\b/.test(lower)) numbers.push(168)
  if (/\bhalf an hour\b/.test(lower)) numbers.push(0.5)
  if (/\b(?:an|one) hour\b/.test(lower)) numbers.push(1)
  return numbers
}

export function collectAllowedNumbers(...sources) {
  const allowed = new Set()
  const addNumber = (value) => {
    const absolute = Math.abs(value)
    for (const rounded of [absolute, Math.round(absolute), Math.round(absolute * 10) / 10]) allowed.add(keyOf(rounded))
    // Ratios may be written as percentages (utilization 1 -> "100%").
    if (absolute <= 2) {
      allowed.add(keyOf(absolute * 100))
      allowed.add(keyOf(Math.round(absolute * 100)))
    }
  }
  const walk = (value) => {
    if (typeof value === 'number' && Number.isFinite(value)) addNumber(value)
    else if (typeof value === 'string') {
      for (const digits of value.match(/\d+(?:\.\d+)?/g) ?? []) addNumber(Number(digits))
    } else if (Array.isArray(value)) value.forEach(walk)
    else if (value && typeof value === 'object') Object.values(value).forEach(walk)
  }
  sources.forEach(walk)
  return allowed
}

export function isGroundedNumber(value, allowed) {
  return allowed.has(keyOf(value))
}

const OVERCLAIM_PATTERNS = [
  { pattern: /\d+(?:\.\d+)?\s*(?:%|percent)\s+(?:chance|probability|likelihood|likely|risk of)/i, reason: 'states a failure probability' },
  { pattern: /\b(?:probability|chance|odds|likelihood)\s+(?:of|that)\b[^.]{0,60}\b(?:fail|failure|break)/i, reason: 'states a failure probability', unlessNegated: true },
  { pattern: /\b(?:definitely|certainly|guaranteed|undoubtedly)\b/i, reason: 'claims certainty' },
  { pattern: /\bwill (?:fail|break down|break)\b/i, reason: 'predicts failure as certain' },
  { pattern: /\broot cause (?:is|was)\b/i, reason: 'states a definitive root cause' },
]

export function findOverclaims(text) {
  const found = []
  for (const { pattern, reason, unlessNegated } of OVERCLAIM_PATTERNS) {
    const match = pattern.exec(text)
    if (!match) continue
    const lead = text.slice(Math.max(0, match.index - 20), match.index).toLowerCase()
    if (unlessNegated && /\b(?:not|no)\b/.test(lead)) continue
    found.push({ phrase: match[0], reason })
  }
  return found
}

// Checks every string inside an AI output object.
export function checkTextClaims(output, allowed, path = 'output') {
  const issues = []
  const walk = (value, at) => {
    if (typeof value === 'string') {
      for (const number of numbersInText(value)) {
        if (!isGroundedNumber(number, allowed)) issues.push(`${at} mentions ${number}, which is not in the facts FORSEER provided`)
      }
      for (const { phrase, reason } of findOverclaims(value)) issues.push(`${at} ${reason} ("${phrase}")`)
    } else if (Array.isArray(value)) value.forEach((item, index) => walk(item, `${at}[${index}]`))
    else if (value && typeof value === 'object') Object.entries(value).forEach(([key, child]) => walk(child, `${at}.${key}`))
  }
  walk(output, path)
  return issues
}
