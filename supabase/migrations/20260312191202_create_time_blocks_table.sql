/*
  # Create Time Blocks Table

  1. New Tables
    - `time_blocks`
      - `id` (uuid, primary key)
      - `block_date` (date, not null) - The date of the block
      - `start_time` (time, nullable) - Start time if partial day block
      - `end_time` (time, nullable) - End time if partial day block
      - `is_full_day` (boolean, default false) - True if blocking entire day
      - `reason` (text, nullable) - Reason for the block
      - `created_by` (uuid, references admin_users) - Admin who created the block
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on `time_blocks` table
    - Add policy for authenticated admin users to manage blocks

  3. Notes
    - Used to block time slots on the calendar
    - Can block full days or specific time ranges
*/

CREATE TABLE IF NOT EXISTS time_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  block_date date NOT NULL,
  start_time time,
  end_time time,
  is_full_day boolean DEFAULT false NOT NULL,
  reason text,
  created_by uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT time_blocks_time_check CHECK (
    (is_full_day = true AND start_time IS NULL AND end_time IS NULL) OR
    (is_full_day = false AND start_time IS NOT NULL AND end_time IS NOT NULL AND start_time < end_time)
  )
);

ALTER TABLE time_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read time blocks"
  ON time_blocks
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admin users can insert time blocks"
  ON time_blocks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
      AND admin_users.is_active = true
    )
  );

CREATE POLICY "Admin users can update their time blocks"
  ON time_blocks
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
      AND admin_users.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
      AND admin_users.is_active = true
    )
  );

CREATE POLICY "Admin users can delete time blocks"
  ON time_blocks
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
      AND admin_users.is_active = true
    )
  );

CREATE INDEX IF NOT EXISTS idx_time_blocks_date ON time_blocks(block_date);
CREATE INDEX IF NOT EXISTS idx_time_blocks_date_range ON time_blocks(block_date, start_time, end_time);
