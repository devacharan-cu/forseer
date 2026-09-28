import { AI_TASKS } from '../config.js'
import { S } from '../schema.js'
import { systemPrompt } from './shared.js'

export const INCIDENT_PROMPT = Object.freeze({
  task: AI_TASKS.INCIDENT,
  system: systemPrompt(`Task: turn an operator's incident report into structured information.
- machineReference is the machine code (from FACTS) the report is about, or the exact reference the operator wrote if it matches no machine, or null if none is named.
- observedFacts are things the report or the records state. source "report" has reference null; source "history" cites a record id from FACTS.
- inferences are your interpretations. Give the basis for each, and a qualitative confidence (low, medium or high), never a percentage.
- historicalMatches cite incident ids from FACTS whose symptoms resemble this report.
- suggestedSeverity uses FORSEER's incident severity scale.
- Say what the evidence resembles; do not name a failed component unless a record states it.`),
  instructions: 'Analyse the incident report inside <user_input> using the JSON schema.',
  schema: S.object({
    machineReference: S.nullable(S.string()),
    symptom: S.string(),
    additionalSymptoms: S.array(S.string()),
    suggestedSeverity: S.oneOf(['low', 'medium', 'high', 'critical']),
    observedFacts: S.array(
      S.object({ statement: S.string(), source: S.oneOf(['report', 'history']), reference: S.nullable(S.string()) }),
    ),
    inferences: S.array(S.object({ statement: S.string(), basis: S.string(), confidence: S.oneOf(['low', 'medium', 'high']) })),
    historicalMatches: S.array(S.object({ incidentId: S.string(), similarity: S.string() })),
    recommendedChecks: S.array(S.string()),
    summary: S.string(),
  }),
})
