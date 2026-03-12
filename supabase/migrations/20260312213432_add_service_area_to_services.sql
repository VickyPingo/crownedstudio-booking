/*
  # Add service_area to services table

  1. Changes
    - Adds `service_area` column to services table (text, default 'treatment')
    - Sets manicure/pedicure services to 'public'
    - Sets all other services to 'treatment'

  2. Business Rules
    - Manicure services -> public area
    - Pedicure services -> public area
    - All other services -> treatment area

  3. Notes
    - service_area must match rooms.room_area for room assignment
    - Default is 'treatment' for backward compatibility
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'services' AND column_name = 'service_area'
  ) THEN
    ALTER TABLE services ADD COLUMN service_area text DEFAULT 'treatment';
  END IF;
END $$;

UPDATE services
SET service_area = 'public'
WHERE slug ILIKE '%manicure%' OR slug ILIKE '%pedicure%'
   OR name ILIKE '%manicure%' OR name ILIKE '%pedicure%'
   OR category ILIKE '%manicure%' OR category ILIKE '%pedicure%';

UPDATE services
SET service_area = 'treatment'
WHERE service_area IS NULL OR service_area = '';
