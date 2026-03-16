/*
  # Add event_booking_id to payment_transactions

  1. Changes
    - Add `event_booking_id` column to `payment_transactions` table
    - This allows reusing the payment_transactions table for event bookings
    - Either booking_id or event_booking_id should be set, not both

  2. Notes
    - Existing spa bookings use booking_id
    - New event bookings use event_booking_id
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_transactions' AND column_name = 'event_booking_id'
  ) THEN
    ALTER TABLE payment_transactions ADD COLUMN event_booking_id uuid REFERENCES event_bookings(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_payment_transactions_event_booking_id ON payment_transactions(event_booking_id);
