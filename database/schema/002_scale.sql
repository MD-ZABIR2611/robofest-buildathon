CREATE INDEX IF NOT EXISTS users_role_idx ON users (role);
CREATE INDEX IF NOT EXISTS users_active_idx ON users (is_active) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS appointments_upcoming_idx
  ON appointments (appointment_start)
  WHERE status IN ('scheduled', 'confirmed');

CREATE INDEX IF NOT EXISTS appointments_doctor_start_idx
  ON appointments (doctor_id, appointment_start);

CREATE INDEX IF NOT EXISTS medication_due_idx
  ON medication_schedules (scheduled_date, scheduled_time)
  WHERE reminder_sent_at IS NULL AND status IN ('scheduled', 'upcoming', 'due');

CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS prescriptions_status_idx ON prescriptions (status);
