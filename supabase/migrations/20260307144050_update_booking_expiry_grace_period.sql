/*
  # Update Booking Expiry Cleanup with Grace Period

  1. Changes
    - Updates the existing cron job to include a 5-minute grace period
    - Customers have 15 minutes to pay (payment_expires_at)
    - System waits additional 5 minutes before cancelling (20 minutes total)
    - This allows late ITN notifications to still confirm bookings

  2. Logic
    - Only cancels bookings where payment_expires_at < NOW() - INTERVAL '5 minutes'
    - Status changes from 'pending_payment' to 'cancelled_expired'
    - Related payment transactions marked as 'expired' (only 'initiated' ones)

  3. Benefits
    - Grace period handles delayed payment notifications
    - Reduces false cancellations from network delays
    - Customers still see 15-minute countdown
    - System is more forgiving of timing issues
*/

-- Remove the old cron job
SELECT cron.unschedule('cleanup-expired-bookings');

-- Create the updated cleanup job with grace period
SELECT cron.schedule(
  'cleanup-expired-bookings',
  '*/5 * * * *',
  $$
    -- Update expired bookings (with 5-minute grace period)
    UPDATE bookings
    SET 
      status = 'cancelled_expired',
      payment_expires_at = NULL,
      updated_at = NOW()
    WHERE 
      status = 'pending_payment'
      AND payment_expires_at < (NOW() - INTERVAL '5 minutes');

    -- Update related payment transactions (only those still unpaid)
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
