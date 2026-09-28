import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { after, describe, it } from 'node:test'
import { AI_ERROR_CODES, AI_TASKS, AiError, generateCandidateActions, parseScenario, analyzeIncident } from '../../src/ai/index.js'
import { freezeDeep, INCIDENT_REPLY, mockProvider, network, NOVA01_IDS, nova01State, PLANS_REPLY, scenarioReply } from './support.js'

const root = new URL('../../', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

function filesUnder(path) {
  const dir = new URL(path, root)
  return readdirSync(dir).flatMap((name) => {
    const child = `${path}${name}`
    return statSync(new URL(child, root)).isDirectory() ? filesUnder(`${child}/`) : [child]
  })
}

const aiSources = filesUnder('src/ai/').filter((f) => f.endsWith('.js')).map((file) => ({ file, text: read(file) }))
const offenders = (pattern, files = aiSources) => files.filter(({ text }) => pattern.test(text)).map(({ file }) => file)

describe('AI can only analyse, parse, propose and explain', () => {
  it('cannot smuggle state changes through extra output fields', async () => {
    const state = freezeDeep(nova01State())
    const before = JSON.stringify(state)
    const sneaky = {
      scenario_parse: { ...scenarioReply({ events: [{ machineCode: 'M4', state: 'failed', durationHours: 8 }] }), machines: [{ code: 'M4', status: 'retired' }] },
      incident_analysis: { ...INCIDENT_REPLY, orders: [{ orderNumber: 'ORD-0482', status: 'completed' }] },
    }
    const { provider } = mockProvider(sneaky)
    const invalid = (error) => error instanceof AiError && error.code === AI_ERROR_CODES.INVALID_OUTPUT
    await assert.rejects(parseScenario({ provider, factoryState: state, text: 'M4 fails for 8 hours' }), invalid)
    await assert.rejects(analyzeIncident({ provider, factoryState: state, report: 'M4 vibrates' }), invalid)
    assert.equal(JSON.stringify(state), before)
  })

  it('cannot slip an unvalidated action past the engine', async () => {
    const plan = {
      ...PLANS_REPLY.plans[0],
      actions: [{ ...PLANS_REPLY.plans[0].actions[0], extraCommand: 'DROP TABLE machines' }],
    }
    const { provider } = mockProvider({ candidate_actions: { plans: [plan], notes: '' } })
    const { candidates, rejected } = await generateCandidateActions({ provider, factoryState: nova01State(), machineId: NOVA01_IDS.M4 })
    assert.equal(candidates.length, 0)
    assert.equal(rejected[0].reason, 'invalid_structure')
  })

  it('never writes to the database: the AI layer does not import src/api or the Supabase client', () => {
    assert.deepEqual(offenders(/from ['"][./]*api\//), [])
    // Only the browser wiring (client.js) loads the Supabase client, lazily, to reach the Edge Function.
    assert.deepEqual(offenders(/supabaseClient/), ['src/ai/client.js'])
  })

  it('uses the engine only through its public API', () => {
    const deepImports = aiSources.filter(({ text }) => /from ['"][./]+engine\/(?!index\.js['"])/.test(text)).map(({ file }) => file)
    assert.deepEqual(deepImports, [])
  })

  it('contains no provider SDK, direct network call, API key or randomness', () => {
    assert.deepEqual(offenders(/@anthropic-ai|openai|generativeai|@google\//i), [])
    assert.deepEqual(offenders(/\bfetch\s*\(|XMLHttpRequest/), [])
    assert.deepEqual(offenders(/API_KEY|sk-ant-|import\.meta\.env/), [])
    assert.deepEqual(offenders(/Math\.random|Date\.now/), [])
  })
})

describe('secret boundary', () => {
  it('the provider SDK and API key exist only in the server-side Edge Function', () => {
    const server = filesUnder('supabase/functions/forseer-ai/').filter((f) => f.endsWith('.ts')).map((file) => ({ file, text: read(file) }))
    assert.deepEqual(offenders(/from ['"]@anthropic-ai\/sdk['"]/, server), ['supabase/functions/forseer-ai/providers/anthropic.ts'])
    // The key's name may appear in comments and tests, but only config.ts reads its value.
    assert.deepEqual(offenders(/getEnv\(['"]ANTHROPIC_API_KEY|Deno\.env\.get\(['"]ANTHROPIC_API_KEY/, server), ['supabase/functions/forseer-ai/config.ts'])
    const clientSources = filesUnder('src/').filter((f) => /\.(js|jsx)$/.test(f)).map((file) => ({ file, text: read(file) }))
    assert.deepEqual(offenders(/ANTHROPIC|sk-ant-|AI_API_KEY/, clientSources), [])
  })

  it('no AI secret is exposed through a VITE_ variable', () => {
    const variables = read('.env.example').split('\n').filter((line) => line.includes('='))
    assert.deepEqual(variables.map((line) => line.split('=')[0]), ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'])
    assert.ok(read('.gitignore').split('\n').includes('.env'))
  })

  it('the Edge Function accepts exactly the tasks the AI layer sends', () => {
    const handler = read('supabase/functions/forseer-ai/handler.ts')
    const allowed = [...handler.match(/ALLOWED_TASKS = \[([\s\S]*?)\]/)[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
    assert.deepEqual(allowed.sort(), Object.values(AI_TASKS).sort())
  })
})

after(() => assert.equal(network.calls, 0, 'AI tests must not touch the network'))
