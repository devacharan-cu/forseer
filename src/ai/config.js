// Client-side AI settings. The model and provider are chosen server-side
// (supabase/functions/forseer-ai/config.ts); the browser never knows either.
export const AI_FUNCTION_NAME = 'forseer-ai'

export const AI_DEFAULT_TIMEOUT_MS = 90_000

// Must match ALLOWED_TASKS in supabase/functions/forseer-ai/handler.ts (checked by a test).
export const AI_TASKS = Object.freeze({
  MACHINE_RISK: 'machine_risk',
  INCIDENT: 'incident_analysis',
  SCENARIO_PARSE: 'scenario_parse',
  CANDIDATE_ACTIONS: 'candidate_actions',
  SCENARIO_EXPLANATION: 'scenario_explanation',
  RECOMMENDATION: 'recommendation',
})

// Enforced locally on every AI output (the provider schema cannot express them).
export const AI_OUTPUT_LIMITS = Object.freeze({
  maxStringLength: 1500,
  maxArrayItems: 12,
})
