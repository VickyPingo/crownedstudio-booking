/*
  # Fix null-expiry manual pending_payment bookings

  ## Summary
  Two manual bookings were created with status 'pending_payment' and NULL payment_expires_at.
  This is an anomaly: manual (admin) bookings should always be 'confirmed', never pending.
  Because payment_expires_at is NULL, the old availability logic treated them as permanently
  blocking rooms, causing ghost conflicts.

  ## Changes
  - Any booking where is_manual_booking = true AND status = 'pending_payment' AND payment_expires_at IS NULL
    is transitioned to 'expired' status.
  - This removes the ghost blocking while preserving the records for audit purposes.

  ## Affected Records
  - d990547e-bc4b-4224-a1e5-f5791daf688c (2026-03-24 08:30)
  - 42af215b-3efd-4e53-8882-d935f1a57c34 (2026-03-24 08:00)
*/

UPDATE bookings
SET
  status = 'expired',
  payment_expires_at = NULL
WHERE
  status = 'pending_payment'
  AND payment_expires_at IS NULL
  AND is_manual_booking = true;
