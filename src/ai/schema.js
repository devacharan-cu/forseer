import { AI_OUTPUT_LIMITS } from './config.js'

// Builders for the JSON-schema subset that structured-output providers accept:
// every object closes with additionalProperties: false and lists all keys as required.
export const S = {
  string: () => ({ type: 'string' }),
  number: () => ({ type: 'number' }),
  boolean: () => ({ type: 'boolean' }),
  oneOf: (values) => ({ type: 'string', enum: [...values] }),
  nullable: (schema) => ({ anyOf: [schema, { type: 'null' }] }),
  array: (items) => ({ type: 'array', items }),
  object: (properties) => ({
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  }),
  any: () => ({}),
}

const TYPE_CHECKS = {
  string: (v) => typeof v === 'string',
  number: (v) => typeof v === 'number' && Number.isFinite(v),
  integer: (v) => Number.isInteger(v),
  boolean: (v) => typeof v === 'boolean',
  null: (v) => v === null,
  object: (v) => v !== null && typeof v === 'object' && !Array.isArray(v),
  array: (v) => Array.isArray(v),
}

// Validates untrusted model output. Returns a list of issues; empty means valid.
export function validateJson(value, schema, path = 'output', limits = AI_OUTPUT_LIMITS) {
  const issues = []
  check(value, schema, path, limits, issues)
  return issues
}

function check(value, schema, path, limits, issues) {
  if (schema.anyOf) {
    const matches = schema.anyOf.some((option) => validateJson(value, option, path, limits).length === 0)
    if (!matches) issues.push(`${path} does not match any allowed shape`)
    return
  }
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type]
    if (!types.some((type) => TYPE_CHECKS[type](value))) {
      issues.push(`${path} must be ${types.join(' or ')}`)
      return
    }
  }
  if (schema.enum && !schema.enum.includes(value)) {
    issues.push(`${path} must be one of: ${schema.enum.join(', ')}`)
    return
  }
  if (typeof value === 'string' && value.length > limits.maxStringLength) {
    issues.push(`${path} is longer than ${limits.maxStringLength} characters`)
  }
  if (Array.isArray(value)) {
    if (value.length > limits.maxArrayItems) issues.push(`${path} has more than ${limits.maxArrayItems} items`)
    if (schema.items) value.forEach((item, index) => check(item, schema.items, `${path}[${index}]`, limits, issues))
  }
  if (TYPE_CHECKS.object(value) && schema.properties) {
    for (const key of schema.required ?? []) {
      if (!(key in value)) issues.push(`${path}.${key} is missing`)
    }
    for (const [key, child] of Object.entries(value)) {
      if (key in schema.properties) check(child, schema.properties[key], `${path}.${key}`, limits, issues)
      else if (schema.additionalProperties === false) issues.push(`${path}.${key} is not an allowed field`)
    }
  }
}
