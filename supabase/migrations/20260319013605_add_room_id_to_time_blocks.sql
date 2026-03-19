/*
  # Add room_id to time_blocks

  ## Summary
  Adds optional room-specific time blocking support to the time_blocks table.

  ## Changes

  ### Modified Tables
  - `time_blocks`
    - New column: `room_id uuid REFERENCES rooms(id) ON DELETE CASCADE` (nullable)

  ## Behavior
  - `room_id = NULL` → global block (applies to the whole studio / all rooms)
  - `room_id = <uuid>` → applies only to that specific room

  ## Security
  - Existing RLS policies are preserved
  - No new policies needed; existing anon read + admin write policies cover the new column
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'time_blocks' AND column_name = 'room_id'
  ) THEN
    ALTER TABLE time_blocks
      ADD COLUMN room_id uuid REFERENCES rooms(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_time_blocks_room_id ON time_blocks(room_id);
