/*
  # Add Pregnancy Information to Bookings

  ## New Fields Added

  ### Bookings Table
  - `is_pregnant` (boolean): Indicates whether the client is pregnant at time of booking
    - Used to determine massage type and safety restrictions
    - Required for service customization and staff awareness

  ## Changes

  1. Add is_pregnant field to bookings table for pregnancy tracking
  2. Default to false for backwards compatibility with existing bookings
  3. Field is NOT NULL to ensure staff always have clear pregnancy status

  ## Notes
  - Pregnancy status is stored per-booking as it may change between visits
  - When true, indicates pregnancy-safe massage protocols must be followed
  - Staff can see this information in booking details for proper service delivery
  - Policy: Only clients between 3-6 months pregnant are accepted
*/

-- Add is_pregnant to bookings table
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'bookings') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'bookings' AND column_name = 'is_pregnant'
    ) THEN
      ALTER TABLE bookings ADD COLUMN is_pregnant boolean DEFAULT false NOT NULL;
    END IF;
  END IF;
END $$;

-- Create index for querying pregnant clients
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'bookings') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_bookings_is_pregnant') THEN
      CREATE INDEX idx_bookings_is_pregnant ON bookings(is_pregnant) WHERE is_pregnant = true;
    END IF;
  END IF;
END $$;
