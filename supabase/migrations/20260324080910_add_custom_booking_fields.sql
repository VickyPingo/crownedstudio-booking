/*
  # Add custom booking fields to bookings table

  ## Summary
  Adds support for "Custom Bookings" — manual bookings that are not tied to an
  existing service record. Staff can now create a booking with a free-text name
  and a custom duration in minutes instead of selecting a service slug.

  ## New Columns on `bookings`
  - `is_custom_booking` (boolean, not null, default false)
      Flags whether this is a custom (non-service) booking.
  - `custom_booking_name` (text, nullable)
      The human-readable name for the custom booking (e.g. "Corporate Chair Massage").
  - `custom_duration_minutes` (integer, nullable)
      The duration in minutes used for this custom booking's room allocation and
      availability checks. Only set when is_custom_booking = true.

  ## Notes
  - Existing rows are unaffected; `is_custom_booking` defaults to false.
  - `service_slug` remains nullable so existing NOT NULL constraints are not broken.
  - No RLS changes needed — bookings table policies are already in place.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'is_custom_booking'
  ) THEN
    ALTER TABLE bookings ADD COLUMN is_custom_booking boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'custom_booking_name'
  ) THEN
    ALTER TABLE bookings ADD COLUMN custom_booking_name text NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'custom_duration_minutes'
  ) THEN
    ALTER TABLE bookings ADD COLUMN custom_duration_minutes integer NULL;
  END IF;
END $$;
