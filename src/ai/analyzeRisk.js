import { buildMachineFacts } from './context.js'
import { checkTextClaims, collectAllowedNumbers } from './grounding.js'
import { RISK_PROMPT } from './prompts/risk.js'
import { rejectIfInvalid, requestStructured } from './structured.js'

const LEVEL_WORDS = /\b(LOW|MODERATE|HIGH|CRITICAL)\b/g

// Explains the engine's operational-risk classification for one machine.
// The level, points and signals are the engine's; the AI only adds prose.
export async function analyzeMachineRisk({ provider, factoryState, machineId }) {
  const facts = buildMachineFacts(factoryState, machineId)
  const analysis = await requestStructured(provider, RISK_PROMPT, { facts })

  const issues = checkTextClaims(analysis, collectAllowedNumbers(facts))
  const signals = new Set(facts.operationalRisk.signals.map((s) => s.signal))
  analysis.contributingFactors.forEach((factor, i) => {
    if (!signals.has(factor.signal)) issues.push(`contributingFactors[${i}].signal "${factor.signal}" is not one of the engine's signals`)
  })
  const records = new Set([...facts.recentIncidents.map((r) => r.id), ...facts.recentMaintenance.map((r) => r.id)])
  analysis.historicalEvidence.forEach((evidence, i) => {
    if (!records.has(evidence.reference)) issues.push(`historicalEvidence[${i}].reference "${evidence.reference}" is not a record in the facts`)
  })
  for (const level of JSON.stringify(analysis).match(LEVEL_WORDS) ?? []) {
    if (level !== facts.operationalRisk.level) issues.push(`the analysis calls the risk ${level}, but FORSEER classifies it ${facts.operationalRisk.level}`)
  }
  rejectIfInvalid('machine risk analysis', issues)

  return {
    machineId,
    code: facts.machine.code,
    operationalRisk: facts.operationalRisk,
    recurringPatterns: facts.recurringPatterns,
    analysis,
    sources: { operationalRisk: 'deterministic_engine', recurringPatterns: 'deterministic_engine', analysis: 'ai' },
  }
}
