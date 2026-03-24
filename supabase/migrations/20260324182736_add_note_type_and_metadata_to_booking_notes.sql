/*
  # Add note_type and metadata to booking_notes

  1. Schema Changes
    - Add `note_type` column to `booking_notes` table
      - Type: text
      - Nullable: true (optional field)
      - Purpose: Track different types of notes (e.g., 'reschedule', 'general', 'payment', etc.)
    
    - Add `metadata` column to `booking_notes` table
      - Type: jsonb
      - Nullable: true (optional field)
      - Purpose: Store structured data related to the note (e.g., reschedule details with old/new times)

  2. Notes
    - These fields are already used in the application code for reschedule notes
    - Adding them to the schema fixes the notes display issue
    - Existing notes will have NULL values for these fields, which is acceptable
*/

-- Add note_type column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'booking_notes' AND column_name = 'note_type'
  ) THEN
    ALTER TABLE booking_notes ADD COLUMN note_type text;
  END IF;
END $$;

-- Add metadata column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'booking_notes' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE booking_notes ADD COLUMN metadata jsonb;
  END IF;
END $$;
