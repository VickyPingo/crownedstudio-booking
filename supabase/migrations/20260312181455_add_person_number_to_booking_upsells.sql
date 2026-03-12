/*
  # Add person_number to booking_upsells

  1. Changes
    - Add `person_number` column to booking_upsells table to track which person selected each upsell
    - Default to 1 for backwards compatibility with existing bookings
    - Drop and recreate primary key to include person_number, allowing the same upsell for different people
  
  2. Purpose
    - Supports per-person upsell selection for group bookings (2-6 people)
    - Each person in a group booking can now select their own upsells independently
*/

ALTER TABLE booking_upsells 
ADD COLUMN IF NOT EXISTS person_number integer NOT NULL DEFAULT 1 
CHECK (person_number >= 1 AND person_number <= 6);

ALTER TABLE booking_upsells 
DROP CONSTRAINT IF EXISTS booking_upsells_pkey;

ALTER TABLE booking_upsells 
ADD PRIMARY KEY (booking_id, upsell_id, person_number);
