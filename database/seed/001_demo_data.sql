INSERT INTO users (id, display_name, role, is_active) VALUES
  ('demo-user-01', '実証利用者01', 'demo_operator', true),
  ('demo-hq-01', '実証本部01', 'demo_hq', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO shelters (id, name, latitude, longitude, initial_status, is_active, created_at, updated_at) VALUES
  ('shelter-001', 'I市防災センター', 35.7050, 140.0100, 'green', true, '2026-08-07 14:20:00+09', '2026-08-07 14:20:00+09'),
  ('shelter-002', 'I市立Alpha中学校', 35.6820, 139.9780, 'yellow', true, '2026-08-07 14:05:00+09', '2026-08-07 14:05:00+09'),
  ('shelter-003', 'I市立Beta小学校', 35.6740, 139.9900, 'red', true, '2026-08-07 13:55:00+09', '2026-08-07 13:55:00+09'),
  ('shelter-004', 'I市立Gamma小学校', 35.6760, 140.0250, 'green', true, '2026-08-07 14:12:00+09', '2026-08-07 14:12:00+09'),
  ('shelter-005', 'I市立Delta中学校', 35.7280, 140.0400, 'gray', true, '2026-08-07 12:40:00+09', '2026-08-07 12:40:00+09')
ON CONFLICT (id) DO NOTHING;

INSERT INTO shelter_status (shelter_id, current_count, confirmed_count, confirmed_at, confirmation_slot, status, confidence, updated_at, updated_by) VALUES
  ('shelter-001', 128, NULL, NULL, NULL, 'green', 'estimated', '2026-08-07 14:20:00+09', 'demo-user-01'),
  ('shelter-002', 86, NULL, NULL, NULL, 'yellow', 'estimated', '2026-08-07 14:05:00+09', 'demo-user-01'),
  ('shelter-003', 174, NULL, NULL, NULL, 'red', 'estimated', '2026-08-07 13:55:00+09', 'demo-user-01'),
  ('shelter-004', 63, NULL, NULL, NULL, 'green', 'estimated', '2026-08-07 14:12:00+09', 'demo-user-01'),
  ('shelter-005', 41, NULL, NULL, NULL, 'gray', 'estimated', '2026-08-07 12:40:00+09', 'demo-user-01')
ON CONFLICT (shelter_id) DO NOTHING;
