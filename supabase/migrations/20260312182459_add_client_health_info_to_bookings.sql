/*
  # Add client health information fields to bookings

  1. New Columns on `bookings` table
    - `allergies` (text, nullable) - Any allergies the client has
    - `massage_pressure` (text, not null) - Preferred massage pressure: soft, medium, or hard
    - `medical_history` (text, nullable) - Any medical history or conditions to be aware of

  2. Notes
    - massage_pressure is required and must be one of: soft, medium, hard
    - allergies and medical_history are optional text fields
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'allergies'
  ) THEN
    ALTER TABLE bookings ADD COLUMN allergies text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'massage_pressure'
  ) THEN
    ALTER TABLE bookings ADD COLUMN massage_pressure text NOT NULL DEFAULT 'medium';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'medical_history'
  ) THEN
    ALTER TABLE bookings ADD COLUMN medical_history text;
  END IF;
END $$;

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_massage_pressure_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_massage_pressure_check
  CHECK (massage_pressure IN ('soft', 'medium', 'hard'));