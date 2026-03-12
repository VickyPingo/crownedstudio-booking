/*
  # Update Booking Status Enum

  1. Changes
    - Add 'no_show' status to booking_status enum

  2. Notes
    - Uses ALTER TYPE to add new value
    - Safe operation that doesn't affect existing data
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'no_show'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'booking_status')
  ) THEN
    ALTER TYPE booking_status ADD VALUE 'no_show';
  END IF;
END $$;
