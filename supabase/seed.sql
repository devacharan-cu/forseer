-- FORSEER demo seed data — factory "NOVA-01"
--
-- Deterministic in structure (fixed UUIDs, fixed relationships, fixed
-- numeric values); timestamps are relative to now() so the demo never
-- looks stale. Run via `supabase db reset` (local) or execute directly
-- against a linked remote project.
--
-- Hero chain for the BEFORE-mode demo:
--   M4 (Stamping Press A, at_risk, escalating vibration incidents)
--   -> Line 2 (Fabrication)
--   -> Order ORD-0482 (critical priority, deadline in ~4 days, at_risk)
-- M7 (Stamping Press B, same line) carries spare capacity
-- (capacity_per_hour - assigned contribution_per_hour) that a future
-- scenario could redirect to cover for M4.
--
-- scenarios / scenario_impacts / scenario_actions / recommendations
-- are intentionally left empty: they are populated by the simulation
-- engine (Phase 2) and AI layer (Phase 3), not by seed data.

-- ==========================================================
-- production_lines
-- ==========================================================
insert into production_lines (id, code, name, capacity_per_hour, status) values
  ('a0000000-0000-0000-0000-000000000001', 'LINE-1', 'Line 1 — Assembly', 210, 'active'),
  ('a0000000-0000-0000-0000-000000000002', 'LINE-2', 'Line 2 — Fabrication', 255, 'active'),
  ('a0000000-0000-0000-0000-000000000003', 'LINE-3', 'Line 3 — Finishing & Packaging', 395, 'active');

-- ==========================================================
-- machines
-- ==========================================================
insert into machines
  (id, code, name, machine_type, status, health_state, capacity_per_hour, maintenance_interval_days, last_maintenance_at) values
  ('b0000000-0000-0000-0000-000000000001', 'M1', 'CNC Mill A', 'CNC Mill', 'operational', 'healthy', 60, 90, now() - interval '15 days'),
  ('b0000000-0000-0000-0000-000000000002', 'M2', 'CNC Mill B', 'CNC Mill', 'operational', 'healthy', 60, 90, now() - interval '10 days'),
  ('b0000000-0000-0000-0000-000000000003', 'M3', 'Welding Robot', 'Welding Robot', 'operational', 'watch', 50, 60, now() - interval '25 days'),
  ('b0000000-0000-0000-0000-000000000004', 'M4', 'Stamping Press A', 'Stamping Press', 'operational', 'at_risk', 80, 45, now() - interval '5 days'),
  ('b0000000-0000-0000-0000-000000000005', 'M5', 'Injection Molder', 'Injection Molder', 'operational', 'healthy', 70, 60, now() - interval '12 days'),
  ('b0000000-0000-0000-0000-000000000006', 'M6', 'Hydraulic Press', 'Hydraulic Press', 'operational', 'healthy', 65, 60, now() - interval '20 days'),
  ('b0000000-0000-0000-0000-000000000007', 'M7', 'Stamping Press B', 'Stamping Press', 'operational', 'healthy', 70, 45, now() - interval '18 days'),
  ('b0000000-0000-0000-0000-000000000008', 'M8', 'Packaging Machine', 'Packaging Machine', 'operational', 'healthy', 90, 30, now() - interval '8 days'),
  ('b0000000-0000-0000-0000-000000000009', 'M9', 'Sealing Machine', 'Sealing Machine', 'operational', 'watch', 85, 30, now() - interval '12 days'),
  ('b0000000-0000-0000-0000-000000000010', 'M10', 'Labeling Machine', 'Labeling Machine', 'operational', 'healthy', 100, 45, now() - interval '20 days'),
  ('b0000000-0000-0000-0000-000000000011', 'M11', 'Quality Inspection Station', 'Inspection Station', 'operational', 'healthy', 120, 90, now() - interval '50 days'),
  ('b0000000-0000-0000-0000-000000000012', 'M12', 'Laser Cutter', 'Laser Cutter', 'operational', 'healthy', 40, 120, now() - interval '60 days');

-- ==========================================================
-- machine_line_assignments
-- ==========================================================
insert into machine_line_assignments (machine_id, production_line_id, contribution_per_hour, is_primary) values
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 60, true),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 60, true),
  ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 50, true),
  ('b0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000001', 40, true),
  ('b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000002', 75, true),
  ('b0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000002', 70, true),
  ('b0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000002', 65, true),
  ('b0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000002', 45, true),
  ('b0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000003', 90, true),
  ('b0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000003', 85, true),
  ('b0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000003', 100, true),
  ('b0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000003', 120, true);

-- ==========================================================
-- machine_dependencies (sequential production flow + one backup)
-- ==========================================================
insert into machine_dependencies (machine_id, depends_on_machine_id, dependency_type, notes) values
  ('b0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'sequential', 'CNC Mill B receives parts milled by CNC Mill A.'),
  ('b0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000002', 'sequential', 'Welding Robot welds parts milled upstream.'),
  ('b0000000-0000-0000-0000-000000000012', 'b0000000-0000-0000-0000-000000000003', 'sequential', 'Laser Cutter trims welded assemblies.'),
  ('b0000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000004', 'sequential', 'Injection Molder receives stamped components from Stamping Press A.'),
  ('b0000000-0000-0000-0000-000000000006', 'b0000000-0000-0000-0000-000000000005', 'sequential', 'Hydraulic Press forms molded parts.'),
  ('b0000000-0000-0000-0000-000000000009', 'b0000000-0000-0000-0000-000000000008', 'sequential', 'Sealing Machine seals packaged output.'),
  ('b0000000-0000-0000-0000-000000000010', 'b0000000-0000-0000-0000-000000000009', 'sequential', 'Labeling Machine labels sealed units.'),
  ('b0000000-0000-0000-0000-000000000011', 'b0000000-0000-0000-0000-000000000010', 'sequential', 'Quality Inspection Station checks labeled units before dispatch.'),
  ('b0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000007', 'backup', 'Stamping Press B carries spare capacity that could absorb Line 2 workload if Stamping Press A is degraded or down.');

-- ==========================================================
-- orders
-- ==========================================================
-- required_production_hours is the REMAINING work, in hours of the line
-- running at its nominal capacity. Fixed ids (c000...<order number>) let
-- demo scenarios reference orders directly.
insert into orders (id, order_number, production_line_id, quantity, required_production_hours, priority, deadline, status) values
  ('c0000000-0000-0000-0000-000000000470', 'ORD-0470', 'a0000000-0000-0000-0000-000000000001', 2000, 40, 'normal', now() - interval '20 days', 'completed'),
  ('c0000000-0000-0000-0000-000000000471', 'ORD-0471', 'a0000000-0000-0000-0000-000000000001', 1500, 30, 'normal', now() - interval '10 days', 'completed'),
  ('c0000000-0000-0000-0000-000000000472', 'ORD-0472', 'a0000000-0000-0000-0000-000000000001', 3000, 12, 'high', now() - interval '2 days', 'late'),
  ('c0000000-0000-0000-0000-000000000473', 'ORD-0473', 'a0000000-0000-0000-0000-000000000001', 1800, 35, 'normal', now() + interval '3 days', 'in_progress'),
  ('c0000000-0000-0000-0000-000000000474', 'ORD-0474', 'a0000000-0000-0000-0000-000000000001', 2200, 42, 'high', now() + interval '6 days', 'in_progress'),
  ('c0000000-0000-0000-0000-000000000475', 'ORD-0475', 'a0000000-0000-0000-0000-000000000001', 1200, 25, 'low', now() + interval '10 days', 'pending'),
  ('c0000000-0000-0000-0000-000000000476', 'ORD-0476', 'a0000000-0000-0000-0000-000000000001', 2600, 48, 'normal', now() + interval '15 days', 'pending'),
  ('c0000000-0000-0000-0000-000000000477', 'ORD-0477', 'a0000000-0000-0000-0000-000000000001', 1900, 34, 'normal', now() + interval '21 days', 'pending'),

  ('c0000000-0000-0000-0000-000000000478', 'ORD-0478', 'a0000000-0000-0000-0000-000000000002', 4000, 70, 'normal', now() - interval '15 days', 'completed'),
  ('c0000000-0000-0000-0000-000000000479', 'ORD-0479', 'a0000000-0000-0000-0000-000000000002', 3200, 60, 'high', now() - interval '5 days', 'completed'),
  ('c0000000-0000-0000-0000-000000000480', 'ORD-0480', 'a0000000-0000-0000-0000-000000000002', 5000, 30, 'high', now() + interval '2 days', 'in_progress'),
  ('c0000000-0000-0000-0000-000000000481', 'ORD-0481', 'a0000000-0000-0000-0000-000000000002', 2800, 18, 'normal', now() + interval '5 days', 'in_progress'),
  ('c0000000-0000-0000-0000-000000000482', 'ORD-0482', 'a0000000-0000-0000-0000-000000000002', 6000, 56, 'critical', now() + interval '4 days', 'at_risk'),
  ('c0000000-0000-0000-0000-000000000483', 'ORD-0483', 'a0000000-0000-0000-0000-000000000002', 3400, 62, 'normal', now() + interval '9 days', 'pending'),
  ('c0000000-0000-0000-0000-000000000484', 'ORD-0484', 'a0000000-0000-0000-0000-000000000002', 2600, 48, 'normal', now() + interval '14 days', 'pending'),
  ('c0000000-0000-0000-0000-000000000485', 'ORD-0485', 'a0000000-0000-0000-0000-000000000002', 3000, 55, 'high', now() + interval '18 days', 'pending'),

  ('c0000000-0000-0000-0000-000000000486', 'ORD-0486', 'a0000000-0000-0000-0000-000000000003', 5000, 45, 'normal', now() - interval '8 days', 'completed'),
  ('c0000000-0000-0000-0000-000000000487', 'ORD-0487', 'a0000000-0000-0000-0000-000000000003', 4200, 10, 'normal', now() - interval '1 days', 'late'),
  ('c0000000-0000-0000-0000-000000000488', 'ORD-0488', 'a0000000-0000-0000-0000-000000000003', 6000, 40, 'high', now() + interval '3 days', 'in_progress'),
  ('c0000000-0000-0000-0000-000000000489', 'ORD-0489', 'a0000000-0000-0000-0000-000000000003', 3800, 34, 'normal', now() + interval '8 days', 'pending'),
  ('c0000000-0000-0000-0000-000000000490', 'ORD-0490', 'a0000000-0000-0000-0000-000000000003', 5200, 46, 'normal', now() + interval '13 days', 'pending'),
  ('c0000000-0000-0000-0000-000000000491', 'ORD-0491', 'a0000000-0000-0000-0000-000000000003', 4600, 40, 'low', now() + interval '20 days', 'pending');

-- ==========================================================
-- maintenance_events
-- ==========================================================
insert into maintenance_events (machine_id, event_type, description, occurred_at, duration_hours, outcome) values
  -- M4: repeated vibration history culminating in current at-risk state
  ('b0000000-0000-0000-0000-000000000004', 'preventive', 'Scheduled preventive maintenance service.', now() - interval '120 days', 3, 'resolved'),
  ('b0000000-0000-0000-0000-000000000004', 'inspection', 'Routine inspection — minor vibration noted in spindle housing.', now() - interval '75 days', 1.5, 'partial'),
  ('b0000000-0000-0000-0000-000000000004', 'repair', 'Bearing replacement due to elevated vibration levels.', now() - interval '50 days', 5, 'resolved'),
  ('b0000000-0000-0000-0000-000000000004', 'inspection', 'Follow-up inspection after recurring vibration complaints — levels still above baseline.', now() - interval '5 days', 2, 'partial'),

  ('b0000000-0000-0000-0000-000000000001', 'preventive', 'Scheduled preventive maintenance service.', now() - interval '60 days', 3, 'resolved'),
  ('b0000000-0000-0000-0000-000000000001', 'inspection', 'Routine inspection.', now() - interval '15 days', 1, 'no_issue_found'),

  ('b0000000-0000-0000-0000-000000000002', 'preventive', 'Scheduled preventive maintenance service.', now() - interval '55 days', 3, 'resolved'),
  ('b0000000-0000-0000-0000-000000000002', 'calibration', 'Routine calibration check.', now() - interval '10 days', 1, 'resolved'),

  ('b0000000-0000-0000-0000-000000000003', 'inspection', 'Routine inspection — alignment drift noted.', now() - interval '40 days', 1.5, 'partial'),
  ('b0000000-0000-0000-0000-000000000003', 'repair', 'Weld arm realignment.', now() - interval '25 days', 4, 'resolved'),

  ('b0000000-0000-0000-0000-000000000005', 'preventive', 'Scheduled preventive maintenance service.', now() - interval '45 days', 3, 'resolved'),
  ('b0000000-0000-0000-0000-000000000005', 'inspection', 'Routine inspection.', now() - interval '12 days', 1, 'no_issue_found'),

  ('b0000000-0000-0000-0000-000000000006', 'preventive', 'Scheduled preventive maintenance service.', now() - interval '50 days', 3, 'resolved'),
  ('b0000000-0000-0000-0000-000000000006', 'inspection', 'Routine inspection.', now() - interval '20 days', 1, 'no_issue_found'),

  ('b0000000-0000-0000-0000-000000000007', 'preventive', 'Scheduled preventive maintenance service.', now() - interval '40 days', 3, 'resolved'),
  ('b0000000-0000-0000-0000-000000000007', 'inspection', 'Routine inspection.', now() - interval '18 days', 1, 'no_issue_found'),

  ('b0000000-0000-0000-0000-000000000008', 'preventive', 'Scheduled preventive maintenance service.', now() - interval '35 days', 2.5, 'resolved'),
  ('b0000000-0000-0000-0000-000000000008', 'inspection', 'Routine inspection.', now() - interval '8 days', 1, 'no_issue_found'),

  ('b0000000-0000-0000-0000-000000000009', 'inspection', 'Routine inspection — temperature fluctuation noted.', now() - interval '30 days', 1.5, 'partial'),
  ('b0000000-0000-0000-0000-000000000009', 'repair', 'Thermostat replaced.', now() - interval '12 days', 3, 'resolved'),

  ('b0000000-0000-0000-0000-000000000010', 'preventive', 'Scheduled preventive maintenance service.', now() - interval '42 days', 2.5, 'resolved'),
  ('b0000000-0000-0000-0000-000000000010', 'inspection', 'Routine inspection.', now() - interval '20 days', 1, 'no_issue_found'),

  ('b0000000-0000-0000-0000-000000000011', 'preventive', 'Scheduled preventive maintenance service.', now() - interval '50 days', 2, 'resolved'),

  ('b0000000-0000-0000-0000-000000000012', 'calibration', 'Routine calibration check.', now() - interval '60 days', 1.5, 'resolved');

-- ==========================================================
-- incidents
-- ==========================================================
insert into incidents (machine_id, description, severity, status, detected_at, resolved_at) values
  -- M4: escalating vibration pattern leading to the current open, high-severity incident
  ('b0000000-0000-0000-0000-000000000004', 'Operator reported unusual vibration during high-speed stamping cycles.', 'low', 'resolved', now() - interval '70 days', now() - interval '65 days'),
  ('b0000000-0000-0000-0000-000000000004', 'Vibration levels exceeded warning threshold during shift; production paused briefly.', 'medium', 'resolved', now() - interval '51 days', now() - interval '50 days'),
  ('b0000000-0000-0000-0000-000000000004', 'Recurring vibration detected again post-repair, intermittent.', 'medium', 'resolved', now() - interval '20 days', now() - interval '18 days'),
  ('b0000000-0000-0000-0000-000000000004', 'Vibration levels rising again during peak load while running Order ORD-0482.', 'high', 'open', now() - interval '3 days', null),

  ('b0000000-0000-0000-0000-000000000003', 'Weld seam alignment drifting out of tolerance.', 'low', 'resolved', now() - interval '38 days', now() - interval '36 days'),
  ('b0000000-0000-0000-0000-000000000003', 'Minor spark irregularity observed during welding pass.', 'low', 'resolved', now() - interval '10 days', now() - interval '9 days'),

  ('b0000000-0000-0000-0000-000000000009', 'Sealing temperature dipped below spec, minor overheating on restart.', 'low', 'resolved', now() - interval '60 days', now() - interval '60 days'),
  ('b0000000-0000-0000-0000-000000000009', 'Sealing temperature fluctuation caused several under-sealed units.', 'medium', 'resolved', now() - interval '13 days', now() - interval '12 days'),

  ('b0000000-0000-0000-0000-000000000001', 'Unusual noise from spindle during operation.', 'low', 'resolved', now() - interval '55 days', now() - interval '54 days'),
  ('b0000000-0000-0000-0000-000000000006', 'Hydraulic pressure fluctuation during press cycle.', 'low', 'resolved', now() - interval '45 days', now() - interval '44 days'),
  ('b0000000-0000-0000-0000-000000000008', 'Packaging feed jam cleared by operator.', 'low', 'resolved', now() - interval '33 days', now() - interval '33 days'),
  ('b0000000-0000-0000-0000-000000000011', 'Inspection station calibration drift flagged by daily check.', 'low', 'resolved', now() - interval '58 days', now() - interval '57 days');
