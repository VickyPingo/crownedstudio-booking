/*
  # Add payment expiry tracking for unpaid bookings

  1. Changes
    - Add `payment_expires_at` column to track when unpaid bookings should expire
    - This field will be set when a booking is created with status `pending_payment`
    - Bookings awaiting payment will automatically expire after a set period (e.g., 30 minutes)
  
  2. Purpose
    - Prevent orphaned unpaid bookings from blocking time slots indefinitely
    - Allow automatic cleanup of expired bookings via future scheduled job
    - Clear expiry tracking separate from `hold_expires_at` which is for temporary holds
  
  3. Implementation
    - `payment_expires_at` is nullable (only set for pending_payment bookings)
    - Once payment is received, this field can be cleared or left as historical record
    - Default expiry will be set to 30 minutes from booking creation
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'payment_expires_at'
  ) THEN
    ALTER TABLE bookings ADD COLUMN payment_expires_at timestamptz;
  END IF;
END $$;
