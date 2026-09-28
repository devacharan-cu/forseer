import { buildComparisonFacts, buildResultFacts } from './context.js'
import { AI_ERROR_CODES, AiError } from './errors.js'
import { checkTextClaims, collectAllowedNumbers } from './grounding.js'
import { EXPLANATION_PROMPT } from './prompts/explanation.js'
import { rejectIfInvalid, requestStructured } from './structured.js'

// Explains engine results in plain language. Every figure in the explanation
// must already be in the engine output; the results themselves are returned untouched.
export async function explainScenario({ provider, factoryState, results, comparison = null }) {
  const list = Array.isArray(results) ? results : [results]
  if (list.length === 0 || !list.every((r) => typeof r?.scenarioId === 'string' && r.metrics && Array.isArray(r.cascade))) {
    throw new AiError(AI_ERROR_CODES.UNSUPPORTED_REQUEST, 'explainScenario needs results produced by simulateScenario()')
  }

  const facts = {
    scenarios: list.map((result) => buildResultFacts(result, factoryState)),
    comparison: comparison ? buildComparisonFacts(comparison) : null,
  }
  const explanation = await requestStructured(provider, EXPLANATION_PROMPT, { facts })
  rejectIfInvalid('scenario explanation', checkTextClaims(explanation, collectAllowedNumbers(facts)))

  return { ...explanation, basedOnScenarioIds: list.map((r) => r.scenarioId), source: 'ai' }
}
