import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  AI_ERROR_CODES,
  AiError,
  createAiProvider,
  createEdgeFunctionTransport,
  createUnavailableProvider,
} from '../../src/ai/index.js'
import { network } from './support.js'

const request = { task: 'scenario_parse', system: 'rules', prompt: 'facts', schema: { type: 'object' } }
const providerReturning = (reply, timeoutMs = 1000) => createAiProvider({ transport: async () => reply, timeoutMs })

const rejectsWith = (promise, code) =>
  assert.rejects(promise, (error) => error instanceof AiError && error.code === code)

describe('AI provider abstraction', () => {
  it('returns parsed JSON from a transport', async () => {
    assert.deepEqual(await providerReturning('{"ok":true}').generateStructured(request), { ok: true })
    assert.deepEqual(await providerReturning({ ok: true }).generateStructured(request), { ok: true })
  })

  it('reports malformed JSON', () => rejectsWith(providerReturning('{not json').generateStructured(request), AI_ERROR_CODES.MALFORMED_OUTPUT))

  it('reports an empty response', async () => {
    await rejectsWith(providerReturning('').generateStructured(request), AI_ERROR_CODES.EMPTY_RESPONSE)
    await rejectsWith(providerReturning(null).generateStructured(request), AI_ERROR_CODES.EMPTY_RESPONSE)
  })

  it('wraps provider failures', () => {
    const provider = createAiProvider({ transport: async () => { throw new Error('upstream 500') } })
    return rejectsWith(provider.generateStructured(request), AI_ERROR_CODES.PROVIDER_ERROR)
  })

  it('times out and aborts a hanging provider', async () => {
    let signal
    const provider = createAiProvider({ timeoutMs: 20, transport: (_request, options) => { signal = options.signal; return new Promise(() => {}) } })
    await rejectsWith(provider.generateStructured(request), AI_ERROR_CODES.TIMEOUT)
    assert.equal(signal.aborted, true)
  })

  it('rejects malformed requests before calling the transport', async () => {
    let called = false
    const provider = createAiProvider({ transport: async () => { called = true; return {} } })
    await rejectsWith(provider.generateStructured({ task: 'x' }), AI_ERROR_CODES.UNSUPPORTED_REQUEST)
    assert.equal(called, false)
  })

  it('an unavailable provider fails fast with ai_unavailable', async () => {
    const provider = createUnavailableProvider()
    assert.equal(provider.available, false)
    await rejectsWith(provider.generateStructured(request), AI_ERROR_CODES.UNAVAILABLE)
  })
})

describe('Edge Function transport', () => {
  const clientReturning = (result) => ({ functions: { invoke: async (name, options) => ({ ...result, name, options }) } })

  it('sends the request to the forseer-ai function and returns its output', async () => {
    let seen
    const client = { functions: { invoke: async (name, options) => { seen = { name, body: options.body }; return { data: { output: { ok: true } }, error: null } } } }
    const provider = createAiProvider({ transport: createEdgeFunctionTransport(() => client) })
    assert.deepEqual(await provider.generateStructured(request), { ok: true })
    assert.deepEqual(seen, { name: 'forseer-ai', body: request })
  })

  it('maps an unreachable function to ai_unavailable', () => {
    const error = Object.assign(new Error('Failed to send a request'), { name: 'FunctionsFetchError' })
    const provider = createAiProvider({ transport: createEdgeFunctionTransport(() => clientReturning({ data: null, error })) })
    return rejectsWith(provider.generateStructured(request), AI_ERROR_CODES.UNAVAILABLE)
  })

  it('passes through the server error code', () => {
    const context = { status: 429, json: async () => ({ error: { code: 'ai_rate_limited', message: 'slow down' } }) }
    const error = Object.assign(new Error('non-2xx'), { name: 'FunctionsHttpError', context })
    const provider = createAiProvider({ transport: createEdgeFunctionTransport(() => clientReturning({ data: null, error })) })
    return rejectsWith(provider.generateStructured(request), AI_ERROR_CODES.RATE_LIMITED)
  })

  it('treats a missing Supabase configuration as AI unavailable', () => {
    const provider = createAiProvider({ transport: createEdgeFunctionTransport(() => { throw new Error('supabaseUrl is required') }) })
    return rejectsWith(provider.generateStructured(request), AI_ERROR_CODES.UNAVAILABLE)
  })

  it('made no network calls', () => assert.equal(network.calls, 0))
})
