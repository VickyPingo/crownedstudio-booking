/*
  # Add Anonymous Read Policy for Time Blocks

  1. Security Changes
    - Add SELECT policy for anonymous users to read time blocks
    - This allows the public booking system to check blocked times
    - Read-only access ensures security while enabling availability checks

  2. Notes
    - Anonymous users can only SELECT, not modify time blocks
    - This is required for the public booking flow to hide blocked slots
*/

CREATE POLICY "Anonymous users can read time blocks"
  ON time_blocks
  FOR SELECT
  TO anon
  USING (true);
