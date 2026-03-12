/*
  # Add Customer Profile Fields

  1. Changes
    - Add `allergies` column to customers table
    - Add `massage_pressure` column to customers table
    - Add `medical_notes` column to customers table
    - Add `private_notes` column for admin-only notes

  2. Notes
    - These fields store client preferences at the customer level
    - Separate from per-booking health info
    - Private notes are only visible to admin staff
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customers' AND column_name = 'allergies'
  ) THEN
    ALTER TABLE customers ADD COLUMN allergies text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customers' AND column_name = 'massage_pressure'
  ) THEN
    ALTER TABLE customers ADD COLUMN massage_pressure text DEFAULT 'medium'
      CHECK (massage_pressure = ANY (ARRAY['soft', 'medium', 'hard']));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customers' AND column_name = 'medical_notes'
  ) THEN
    ALTER TABLE customers ADD COLUMN medical_notes text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customers' AND column_name = 'private_notes'
  ) THEN
    ALTER TABLE customers ADD COLUMN private_notes text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customers' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE customers ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;
END $$;

CREATE OR REPLACE FUNCTION update_customers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'customers_updated_at'
  ) THEN
    CREATE TRIGGER customers_updated_at
      BEFORE UPDATE ON customers
      FOR EACH ROW
      EXECUTE FUNCTION update_customers_updated_at();
  END IF;
END $$;
