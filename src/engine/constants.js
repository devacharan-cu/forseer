import { deepFreeze } from './helpers.js'

export const ENGINE_VERSION = '1.0.0'
export const ENGINE_STATE_VERSION = 1

export const MACHINE_STATES = deepFreeze([
  'healthy',
  'monitoring',
  'at_risk',
  'degraded',
  'failed',
  'maintenance',
  'retired',
])

export const ACTION_TYPES = deepFreeze([
  'preventive_maintenance',
  'repair',
  'reroute_order',
  'reduce_machine_load',
  'reschedule_order',
  'split_workload',
])

export const DEADLINE_STATUS_RANK = deepFreeze({ SAFE: 0, WARNING: 1, CRITICAL: 2, BREACHED: 3 })
export const DEADLINE_STATUSES = deepFreeze(Object.keys(DEADLINE_STATUS_RANK))

export const RISK_LEVELS = deepFreeze(['LOW', 'MODERATE', 'HIGH', 'CRITICAL'])

export const PRIORITY_RANK = deepFreeze({ low: 0, normal: 1, high: 2, critical: 3 })

export const OPEN_ORDER_STATUSES = deepFreeze(['pending', 'in_progress', 'at_risk', 'late'])

// 'backup' dependencies describe an alternative machine, not a constraint on output.
export const CONSTRAINING_DEPENDENCY_TYPES = deepFreeze(['sequential', 'shared_resource'])

// Maintenance event types that actually service a machine (inspections and
// calibrations do not reset the service interval).
export const SERVICE_EVENT_TYPES = deepFreeze(['preventive', 'repair', 'emergency'])
export const REPAIR_EVENT_TYPES = deepFreeze(['repair', 'emergency'])

// Mirrors the CHECK constraints in supabase/migrations/001_initial_forseer_schema.sql.
export const DB_VOCABULARY = deepFreeze({
  machineStatus: ['operational', 'degraded', 'down', 'maintenance', 'retired'],
  healthState: ['healthy', 'watch', 'at_risk', 'critical'],
  lineStatus: ['active', 'reduced', 'stopped'],
  orderStatus: ['pending', 'in_progress', 'at_risk', 'completed', 'cancelled', 'late'],
  priority: ['low', 'normal', 'high', 'critical'],
  dependencyType: ['sequential', 'shared_resource', 'backup'],
  maintenanceEventType: ['inspection', 'preventive', 'repair', 'emergency', 'calibration'],
  maintenanceOutcome: ['resolved', 'partial', 'no_issue_found', 'failed', 'pending'],
  incidentSeverity: ['low', 'medium', 'high', 'critical'],
  incidentStatus: ['open', 'investigating', 'resolved', 'closed'],
})
