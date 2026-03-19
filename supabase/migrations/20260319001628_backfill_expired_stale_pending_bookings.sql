/*
  # Backfill expired stale pending_payment bookings

  ## Summary
  Any customer booking with status 'pending_payment' where the payment_expires_at
  timestamp is in the past should have been transitioned to 'expired' by the cleanup
  cron job. This migration handles bookings where the cron did not run in time.

  ## Changes
  - All bookings with status = 'pending_payment' AND payment_expires_at < now()
    are set to status = 'expired'.
  - These bookings no longer block rooms.
  - They remain visible in the admin for audit purposes.
*/

UPDATE bookings
SET status = 'expired'
WHERE
  status = 'pending_payment'
  AND payment_expires_at IS NOT NULL
  AND payment_expires_at < now();
