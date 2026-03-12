/*
  # Create Booking Notes Table

  1. New Tables
    - `booking_notes`
      - `id` (uuid, primary key)
      - `booking_id` (uuid, references bookings)
      - `note` (text, not null)
      - `created_by` (uuid, references admin_users)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on `booking_notes` table
    - Add policy for authenticated admin users to manage notes

  3. Notes
    - Used for internal staff notes on bookings
    - Separate from client_notes which are client-facing
*/

CREATE TABLE IF NOT EXISTS booking_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  note text NOT NULL,
  created_by uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE booking_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin users can read booking notes"
  ON booking_notes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
      AND admin_users.is_active = true
    )
  );

CREATE POLICY "Admin users can insert booking notes"
  ON booking_notes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
      AND admin_users.is_active = true
    )
  );

CREATE POLICY "Admin users can delete their own notes"
  ON booking_notes
  FOR DELETE
  TO authenticated
  USING (
    created_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
      AND admin_users.is_active = true
    )
  );

CREATE INDEX IF NOT EXISTS idx_booking_notes_booking_id ON booking_notes(booking_id);
