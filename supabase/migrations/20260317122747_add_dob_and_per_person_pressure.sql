/*
  # Add Date of Birth and Per-Person Pressure Tracking

  ## New Fields Added

  ### Customers Table
  - `date_of_birth` (date): Customer's date of birth for identification and age-related service requirements

  ### Bookings Table
  - `customer_date_of_birth` (date): Snapshot of customer's DOB at time of booking
  - `pressure_preferences` (jsonb): Per-person massage pressure preferences stored as JSON
    Format: {"1": "medium", "2": "soft", "3": "hard"}
    - Key: person number (1-based index)
    - Value: pressure preference ("soft", "medium", or "hard")

  ## Changes

  1. Add DOB to customers table for persistent customer records
  2. Add DOB snapshot to bookings for historical accuracy
  3. Add pressure_preferences to bookings to store per-person massage pressure

  ## Notes
  - DOB is stored on both customer (persistent) and booking (snapshot) for audit trail
  - Pressure preferences stored as JSONB for flexibility and easy querying
  - All fields allow NULL for backwards compatibility with existing data
*/

-- Add date_of_birth to customers table (if customers table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'customers') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'customers' AND column_name = 'date_of_birth'
    ) THEN
      ALTER TABLE customers ADD COLUMN date_of_birth date;
    END IF;
  END IF;
END $$;

-- Add customer_date_of_birth snapshot to bookings table (if bookings table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'bookings') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'bookings' AND column_name = 'customer_date_of_birth'
    ) THEN
      ALTER TABLE bookings ADD COLUMN customer_date_of_birth date;
    END IF;
  END IF;
END $$;

-- Add pressure_preferences to bookings table (if bookings table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'bookings') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'bookings' AND column_name = 'pressure_preferences'
    ) THEN
      ALTER TABLE bookings ADD COLUMN pressure_preferences jsonb DEFAULT '{}'::jsonb;
    END IF;
  END IF;
END $$;

-- Create index on customer DOB for age-based queries (if customers table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'customers') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_customers_date_of_birth') THEN
      CREATE INDEX idx_customers_date_of_birth ON customers(date_of_birth);
    END IF;
  END IF;
END $$;

-- Create index on pressure preferences for querying specific preferences (if bookings table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'bookings') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_bookings_pressure_preferences') THEN
      CREATE INDEX idx_bookings_pressure_preferences ON bookings USING gin(pressure_preferences);
    END IF;
  END IF;
END $$;
