/*
  # Add room_id to bookings table

  1. Changes
    - Adds `room_id` column to bookings table (nullable, references rooms.id)
    - Each booking can be assigned to one room
    - Supports automatic room allocation based on priority

  2. Notes
    - Room assignment is optional (nullable) for backward compatibility
    - Existing bookings will have null room_id until assigned
    - Foreign key ensures referential integrity
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'room_id'
  ) THEN
    ALTER TABLE bookings ADD COLUMN room_id uuid REFERENCES rooms(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_bookings_room_id ON bookings(room_id);
CREATE INDEX IF NOT EXISTS idx_bookings_start_time_status ON bookings(start_time, status);
