/*
  # Create Email Logs and Scheduled Reminders Tables

  1. New Tables
    - `email_logs` - tracks all sent emails for troubleshooting and preventing duplicates
      - `id` (uuid, primary key)
      - `booking_id` (uuid, references bookings)
      - `email_type` (text) - type of email: new_booking_spa, booking_confirmation, payment_received_spa, payment_confirmation, reminder_24h
      - `recipient_email` (text) - email address sent to
      - `recipient_type` (text) - 'client' or 'spa'
      - `status` (text) - 'pending', 'sent', 'failed'
      - `resend_id` (text) - Resend API response ID for tracking
      - `error_message` (text) - error details if failed
      - `sent_at` (timestamptz) - when email was sent
      - `created_at` (timestamptz)
    
    - `scheduled_reminders` - tracks scheduled reminder emails
      - `id` (uuid, primary key)
      - `booking_id` (uuid, references bookings)
      - `reminder_type` (text) - '24h_before'
      - `scheduled_for` (timestamptz) - when to send
      - `status` (text) - 'pending', 'sent', 'cancelled', 'failed'
      - `sent_at` (timestamptz)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on both tables
    - Policies for authenticated admin access

  3. Indexes
    - Index on email_logs for duplicate checking
    - Index on scheduled_reminders for cron job queries
*/

CREATE TABLE IF NOT EXISTS email_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid REFERENCES bookings(id) ON DELETE CASCADE,
  email_type text NOT NULL CHECK (email_type IN ('new_booking_spa', 'booking_confirmation', 'payment_received_spa', 'payment_confirmation', 'reminder_24h')),
  recipient_email text NOT NULL,
  recipient_type text NOT NULL CHECK (recipient_type IN ('client', 'spa')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  resend_id text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scheduled_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid REFERENCES bookings(id) ON DELETE CASCADE,
  reminder_type text NOT NULL DEFAULT '24h_before' CHECK (reminder_type IN ('24h_before')),
  scheduled_for timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'cancelled', 'failed')),
  sent_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read email logs"
  ON email_logs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert email logs"
  ON email_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update email logs"
  ON email_logs FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can read scheduled reminders"
  ON scheduled_reminders FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert scheduled reminders"
  ON scheduled_reminders FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update scheduled reminders"
  ON scheduled_reminders FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_email_logs_booking_type ON email_logs(booking_id, email_type);
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON email_logs(status);
CREATE INDEX IF NOT EXISTS idx_scheduled_reminders_pending ON scheduled_reminders(status, scheduled_for) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_scheduled_reminders_booking ON scheduled_reminders(booking_id);
