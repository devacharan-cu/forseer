import { AI_TASKS } from '../config.js'
import { S } from '../schema.js'
import { systemPrompt } from './shared.js'

export const RECOMMENDATION_PROMPT = Object.freeze({
  task: AI_TASKS.RECOMMENDATION,
  system: systemPrompt(`Task: recommend one of the options FORSEER has already simulated, or none of them.
- recommendedScenarioId must be the scenarioId of an option in FACTS, the baseline's scenarioId, or null if no option is acceptable.
- Base the choice only on the simulated results and the stated assumptions. Name the trade-off you are accepting.
- actionSequence lists the concrete steps of the recommended option, in order, in plain language.
- caveats repeats assumptions the result depends on (for example, that maintenance prevents the failure).
- evidenceStrength is qualitative (low, medium or high): how directly the results support the choice.`),
  instructions: 'Recommend an option using the JSON schema.',
  schema: S.object({
    recommendedScenarioId: S.nullable(S.string()),
    rationale: S.string(),
    actionSequence: S.array(S.string()),
    tradeoffs: S.array(S.string()),
    caveats: S.array(S.string()),
    evidenceStrength: S.oneOf(['low', 'medium', 'high']),
  }),
})
