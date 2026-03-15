/*
  # Add pricing option name column to bookings

  1. Changes
    - Add `pricing_option_name` column to store the display name of the selected pricing option
    - This allows showing "3 Session Special" or "Single" in booking displays
    
  2. Notes
    - Column is nullable since not all services use pricing options
    - Existing bookings will have NULL values
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'pricing_option_name'
  ) THEN
    ALTER TABLE bookings ADD COLUMN pricing_option_name text;
  END IF;
END $$;