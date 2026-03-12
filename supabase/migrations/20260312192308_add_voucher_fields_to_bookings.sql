/*
  # Add Voucher Fields to Bookings

  1. Changes
    - Add `voucher_code` column to bookings table
    - Add `voucher_discount` column to bookings table
    - Add `voucher_id` column to bookings table (foreign key)

  2. Notes
    - Stores the voucher code used at time of booking
    - Stores the actual discount amount applied
    - Links to the voucher record for tracking
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'voucher_code'
  ) THEN
    ALTER TABLE bookings ADD COLUMN voucher_code text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'voucher_discount'
  ) THEN
    ALTER TABLE bookings ADD COLUMN voucher_discount numeric DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'voucher_id'
  ) THEN
    ALTER TABLE bookings ADD COLUMN voucher_id uuid REFERENCES vouchers(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_bookings_voucher_id ON bookings(voucher_id);
