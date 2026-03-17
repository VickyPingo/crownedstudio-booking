/*
  # Add Terms & Conditions Consent to Bookings

  1. Changes
    - Add `terms_accepted` boolean field to bookings table
    - Add `terms_accepted_at` timestamptz field to bookings table
    - Both fields allow null for historical bookings
    - New bookings will require terms_accepted = true via application logic

  2. Fields
    - `terms_accepted` - Boolean flag indicating customer accepted T&C
    - `terms_accepted_at` - Timestamp when customer accepted T&C

  3. Notes
    - Historical bookings will have null values (acceptable)
    - All new bookings must set these fields via application validation
    - No RLS changes needed (inherits from existing bookings policies)
*/

-- Add terms consent fields to bookings table
DO $$
BEGIN
  -- Add terms_accepted column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'terms_accepted'
  ) THEN
    ALTER TABLE bookings ADD COLUMN terms_accepted boolean DEFAULT false;
  END IF;

  -- Add terms_accepted_at column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'terms_accepted_at'
  ) THEN
    ALTER TABLE bookings ADD COLUMN terms_accepted_at timestamptz;
  END IF;
END $$;

-- Add comment for documentation
COMMENT ON COLUMN bookings.terms_accepted IS 'Customer acceptance of Terms & Conditions';
COMMENT ON COLUMN bookings.terms_accepted_at IS 'Timestamp when customer accepted Terms & Conditions';
