/*
  # Add cancelled_expired Status to Booking Enum

  1. Changes
    - Adds 'cancelled_expired' to the booking_status enum type
    - This status is used when bookings are automatically cancelled after payment expiry

  2. Notes
    - Safe operation - only adds a new enum value, doesn't modify existing data
    - Required for the booking expiry cleanup process
*/

-- Add cancelled_expired to booking_status enum if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'cancelled_expired'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'booking_status')
  ) THEN
    ALTER TYPE booking_status ADD VALUE 'cancelled_expired';
  END IF;
END $$;
