// Server-side AI configuration: the only place the provider, model and API key are chosen.
// Secrets come from Supabase function secrets (`supabase secrets set ...`), never from the client.

export type Effort = 'low' | 'medium' | 'high'

export interface AiServerConfig {
  provider: string
  model: string
  apiKey: string | null
  timeoutMs: number
  maxOutputTokens: number
  effortByTask: Record<string, Effort>
}

export const DEFAULT_PROVIDER = 'anthropic'
export const DEFAULT_MODEL = 'claude-opus-5'

// Parsing and extraction need less deliberation than weighing options.
const EFFORT_BY_TASK: Record<string, Effort> = {
  machine_risk: 'medium',
  incident_analysis: 'medium',
  scenario_parse: 'low',
  candidate_actions: 'high',
  scenario_explanation: 'medium',
  recommendation: 'high',
}

export function loadConfig(getEnv: (name: string) => string | undefined): AiServerConfig {
  return {
    provider: getEnv('FORSEER_AI_PROVIDER') ?? DEFAULT_PROVIDER,
    model: getEnv('FORSEER_AI_MODEL') ?? DEFAULT_MODEL,
    apiKey: getEnv('ANTHROPIC_API_KEY') ?? null,
    timeoutMs: 80_000,
    maxOutputTokens: 16_000,
    effortByTask: EFFORT_BY_TASK,
  }
}
