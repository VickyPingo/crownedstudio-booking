/*
  # Add Manual Booking Tracking Fields

  1. New Columns on `bookings` table
    - `is_manual_booking` (boolean, default false) - indicates if booking was created by admin
    - `created_by_admin` (uuid, nullable) - references admin_users who created the booking
    - `payment_method_manual` (text, nullable) - tracks manual payment method (cash, card, eft)
    - `deposit_paid_manually` (boolean, default false) - if deposit was marked as paid manually
    - `deposit_paid_at` (timestamptz, nullable) - when deposit was marked as paid

  2. Purpose
    - Distinguish manual admin bookings from public website bookings
    - Track payment status for walk-ins and phone bookings
    - Audit trail for who created manual bookings
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'is_manual_booking'
  ) THEN
    ALTER TABLE bookings ADD COLUMN is_manual_booking boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'created_by_admin'
  ) THEN
    ALTER TABLE bookings ADD COLUMN created_by_admin uuid REFERENCES admin_users(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'payment_method_manual'
  ) THEN
    ALTER TABLE bookings ADD COLUMN payment_method_manual text CHECK (payment_method_manual IS NULL OR payment_method_manual = ANY (ARRAY['cash'::text, 'card'::text, 'eft'::text, 'voucher'::text, 'complimentary'::text]));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'deposit_paid_manually'
  ) THEN
    ALTER TABLE bookings ADD COLUMN deposit_paid_manually boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'deposit_paid_at'
  ) THEN
    ALTER TABLE bookings ADD COLUMN deposit_paid_at timestamptz;
  END IF;
END $$;
