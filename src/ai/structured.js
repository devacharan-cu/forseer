import { AI_ERROR_CODES, AiError } from './errors.js'
import { buildPrompt } from './prompts/shared.js'
import { validateJson } from './schema.js'

// Sends one structured request and returns output that has passed schema
// validation. Callers add their own semantic checks with rejectIfInvalid().
export async function requestStructured(provider, spec, { facts, userInput }) {
  if (!provider || typeof provider.generateStructured !== 'function') {
    throw new AiError(AI_ERROR_CODES.UNAVAILABLE, 'No AI provider is configured')
  }
  const output = await provider.generateStructured({
    task: spec.task,
    system: spec.system,
    prompt: buildPrompt({ instructions: spec.instructions, facts, userInput }),
    schema: spec.schema,
  })
  rejectIfInvalid(spec.task, validateJson(output, spec.localSchema ?? spec.schema))
  // Detach from anything the transport might still hold.
  return structuredClone(output)
}

export function rejectIfInvalid(label, issues) {
  if (issues.length > 0) {
    throw new AiError(AI_ERROR_CODES.INVALID_OUTPUT, `The AI output for ${label} failed validation`, { issues })
  }
}

// Collects YYYY-MM-DD dates found anywhere in a facts object.
export function datesIn(value, found = new Set()) {
  if (typeof value === 'string') for (const date of value.match(/\d{4}-\d{2}-\d{2}/g) ?? []) found.add(date)
  else if (Array.isArray(value)) value.forEach((item) => datesIn(item, found))
  else if (value && typeof value === 'object') Object.values(value).forEach((item) => datesIn(item, found))
  return found
}
