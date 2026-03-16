/*
  # Add weekend_surcharge_amount column to bookings

  1. Changes
    - Adds `weekend_surcharge_amount` column to `bookings` table
    - This column stores the calculated weekend/public holiday surcharge for each booking
    - Default value is 0 for services without surcharges

  2. Notes
    - This allows tracking of surcharges applied for weekend and public holiday bookings
    - Only services with weekend_surcharge_pp > 0 will have non-zero values
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'weekend_surcharge_amount'
  ) THEN
    ALTER TABLE bookings ADD COLUMN weekend_surcharge_amount numeric DEFAULT 0;
  END IF;
END $$;
