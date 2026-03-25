/*
  # Create booking_audit_log table

  ## Purpose
  Provides a full immutable audit trail of every significant admin action taken
  on a booking, so multiple admins can see exactly who changed what and when.

  ## New Tables

  ### `booking_audit_log`
  - `id` (uuid, PK) — unique entry identifier
  - `booking_id` (uuid, indexed) — which booking was changed (no FK enforced so
    this migration is safe to run independently of the bookings table migration order)
  - `action_type` (text) — one of: booking_created, status_changed, rescheduled,
    room_changed, payment_updated, cancelled, completed, no_show, note_added
  - `changed_by_admin_id` (uuid, nullable) — auth.users id of the admin who acted
  - `changed_by_name` (text, nullable) — display name of the admin at time of action
  - `details_json` (jsonb, nullable) — structured diff data (from → to)
  - `created_at` (timestamptz) — timestamp of the action

  ## Security
  - RLS enabled
  - Authenticated users (admins) can SELECT all rows
  - INSERT is permitted for authenticated users (writes happen server-side and
    client-side via the logged-in admin session)
  - No UPDATE or DELETE — the log is append-only
*/

CREATE TABLE IF NOT EXISTS booking_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL,
  action_type text NOT NULL,
  changed_by_admin_id uuid NULL,
  changed_by_name text NULL,
  details_json jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS booking_audit_log_booking_id_idx ON booking_audit_log(booking_id);
CREATE INDEX IF NOT EXISTS booking_audit_log_created_at_idx ON booking_audit_log(created_at DESC);

ALTER TABLE booking_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated admins can read audit log"
  ON booking_audit_log FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated admins can insert audit log"
  ON booking_audit_log FOR INSERT
  TO authenticated
  WITH CHECK (true);
