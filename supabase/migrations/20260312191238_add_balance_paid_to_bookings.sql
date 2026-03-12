/*
  # Add Balance Tracking to Bookings

  1. Changes
    - Add `balance_paid` column to bookings table
    - Add `balance_paid_at` column to track when balance was marked paid
    - Add `balance_paid_by` column to track who marked it paid

  2. Notes
    - Allows admin to manually mark balance as paid
    - Tracks audit trail for payment marking
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'balance_paid'
  ) THEN
    ALTER TABLE bookings ADD COLUMN balance_paid numeric DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'balance_paid_at'
  ) THEN
    ALTER TABLE bookings ADD COLUMN balance_paid_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'balance_paid_by'
  ) THEN
    ALTER TABLE bookings ADD COLUMN balance_paid_by uuid REFERENCES admin_users(id) ON DELETE SET NULL;
  END IF;
END $$;
