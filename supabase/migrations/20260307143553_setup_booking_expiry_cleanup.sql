/*
  # Setup Automatic Booking Expiry Cleanup

  1. Changes
    - Enable pg_cron extension for scheduled jobs
    - Create a scheduled job that runs every 5 minutes
    - Job updates bookings from 'pending_payment' to 'cancelled_expired' when payment_expires_at has passed
    - Also marks related payment transactions as 'expired'

  2. Security
    - Job runs with database permissions
    - Only affects bookings in 'pending_payment' status
    - Only affects transactions in 'initiated' status

  3. Notes
    - Runs every 5 minutes to ensure timely cleanup
    - No external API calls needed
    - Fully automatic and self-contained
*/

-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create the cleanup job that runs every 5 minutes
SELECT cron.schedule(
  'cleanup-expired-bookings',
  '*/5 * * * *',
  $$
    -- Update expired bookings
    UPDATE bookings
    SET 
      status = 'cancelled_expired',
      payment_expires_at = NULL,
      updated_at = NOW()
    WHERE 
      status = 'pending_payment'
      AND payment_expires_at < NOW();

    -- Update related payment transactions
    UPDATE payment_transactions
    SET 
      status = 'expired',
      updated_at = NOW()
    WHERE 
      booking_id IN (
        SELECT id FROM bookings WHERE status = 'cancelled_expired'
      )
      AND status = 'initiated';
  $$
);
