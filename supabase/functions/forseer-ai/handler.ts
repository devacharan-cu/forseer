import { type AiServerConfig, loadConfig } from './config.ts'
import { type AiErrorCode, ERROR_STATUS, ProviderError } from './errors.ts'
import { generateWithAnthropic, type StructuredRequest, type StructuredResult } from './providers/anthropic.ts'

// Must match AI_TASKS in src/ai/config.js (checked by a test).
export const ALLOWED_TASKS = [
  'machine_risk',
  'incident_analysis',
  'scenario_parse',
  'candidate_actions',
  'scenario_explanation',
  'recommendation',
]

// Caps keep this endpoint from being usable as a general-purpose model proxy.
const LIMITS = { system: 12_000, prompt: 80_000, schema: 20_000 }

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type Generate = (config: AiServerConfig, request: StructuredRequest) => Promise<StructuredResult>

const PROVIDERS: Record<string, Generate> = { anthropic: generateWithAnthropic }

export function createHandler({
  getEnv = (name: string) => Deno.env.get(name),
  providers = PROVIDERS,
}: { getEnv?: (name: string) => string | undefined; providers?: Record<string, Generate> } = {}) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
    if (req.method !== 'POST') return errorResponse('ai_unsupported_request', 'Use POST')

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return errorResponse('ai_unsupported_request', 'The request body must be JSON')
    }
    const issue = validateRequest(body)
    if (issue) return errorResponse('ai_unsupported_request', issue)

    const config = loadConfig(getEnv)
    const generate = providers[config.provider]
    if (!generate) return errorResponse('ai_unavailable', `AI provider "${config.provider}" is not supported`)
    if (!config.apiKey) return errorResponse('ai_unavailable', 'The AI provider is not configured on the server')

    try {
      const result = await generate(config, body as StructuredRequest)
      return jsonResponse(200, { output: result.output, model: result.model })
    } catch (error) {
      if (error instanceof ProviderError) return errorResponse(error.code, error.message)
      console.error('forseer-ai: unexpected failure', error)
      return errorResponse('ai_provider_error', 'The AI service failed unexpectedly')
    }
  }
}

function validateRequest(body: unknown): string | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'The request body must be an object'
  const { task, system, prompt, schema } = body as Record<string, unknown>
  if (typeof task !== 'string' || !ALLOWED_TASKS.includes(task)) return 'Unknown task'
  if (typeof system !== 'string' || system.length === 0 || system.length > LIMITS.system) return 'Invalid system prompt'
  if (typeof prompt !== 'string' || prompt.length === 0 || prompt.length > LIMITS.prompt) return 'Invalid prompt'
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return 'Invalid schema'
  if (JSON.stringify(schema).length > LIMITS.schema) return 'Schema too large'
  const allowedKeys = new Set(['task', 'system', 'prompt', 'schema'])
  if (Object.keys(body).some((key) => !allowedKeys.has(key))) return 'Unexpected fields in request'
  return null
}

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
}

function errorResponse(code: AiErrorCode, message: string): Response {
  return jsonResponse(ERROR_STATUS[code], { error: { code, message } })
}
