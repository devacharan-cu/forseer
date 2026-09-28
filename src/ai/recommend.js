import { buildComparisonFacts, buildResultFacts } from './context.js'
import { checkTextClaims, collectAllowedNumbers } from './grounding.js'
import { RECOMMENDATION_PROMPT } from './prompts/recommendation.js'
import { rejectIfInvalid, requestStructured } from './structured.js'

// Recommends one already-simulated option (or none). It runs only after the
// engine has evaluated every option. The actions returned are the engine-validated
// actions of the chosen option, never text from the model, and still need a person to confirm them.
export async function recommendOption({ provider, factoryState, baseline, options, comparison }) {
  const facts = {
    baseline: buildResultFacts(baseline, factoryState),
    options: options.map((option) => ({
      scenarioId: option.result.scenarioId,
      title: option.plan.title,
      source: option.plan.source,
      planAssumptions: option.assumptions,
      result: buildResultFacts(option.result, factoryState),
    })),
    comparison: buildComparisonFacts(comparison),
  }
  const recommendation = await requestStructured(provider, RECOMMENDATION_PROMPT, { facts })

  const issues = checkTextClaims(recommendation, collectAllowedNumbers(facts))
  const known = new Set([baseline.scenarioId, ...options.map((o) => o.result.scenarioId)])
  if (recommendation.recommendedScenarioId !== null && !known.has(recommendation.recommendedScenarioId)) {
    issues.push(`recommendedScenarioId "${recommendation.recommendedScenarioId}" was not simulated`)
  }
  rejectIfInvalid('recommendation', issues)

  const chosen = options.find((o) => o.result.scenarioId === recommendation.recommendedScenarioId) ?? null
  return {
    ...recommendation,
    recommendedActions: chosen ? structuredClone(chosen.scenario.actions) : [],
    requiresConfirmation: true,
    source: 'ai',
  }
}
