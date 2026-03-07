/*
  # Add discount tracking to bookings

  1. Changes
    - Add `discount_amount` column to track any discounts applied
    - Add `discount_type` column to track the type of discount (repeat_customer, etc.)
  
  2. Notes
    - Both fields are nullable since not all bookings will have discounts
    - This allows us to track the repeat customer discount that's applied in the booking flow
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'discount_amount'
  ) THEN
    ALTER TABLE bookings ADD COLUMN discount_amount numeric DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'discount_type'
  ) THEN
    ALTER TABLE bookings ADD COLUMN discount_type text;
  END IF;
END $$;