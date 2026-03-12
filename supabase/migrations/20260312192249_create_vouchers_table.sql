/*
  # Create Vouchers System

  1. New Tables
    - `vouchers`
      - `id` (uuid, primary key)
      - `code` (text, unique, not null) - The voucher code customers enter
      - `discount_type` (text, not null) - 'fixed' or 'percentage'
      - `discount_value` (numeric, not null) - Amount for fixed, percentage for percentage type
      - `min_spend` (numeric, default 0) - Minimum booking total to use voucher
      - `usage_limit` (integer, nullable) - Maximum uses allowed (null = unlimited)
      - `usage_count` (integer, default 0) - Current number of times used
      - `expires_at` (timestamptz, nullable) - Expiry date (null = never expires)
      - `is_active` (boolean, default true) - Whether voucher can be used
      - `created_by` (uuid, references admin_users) - Admin who created voucher
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `voucher_usage`
      - `id` (uuid, primary key)
      - `voucher_id` (uuid, references vouchers)
      - `booking_id` (uuid, references bookings)
      - `discount_applied` (numeric) - Actual discount amount applied
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on both tables
    - Add appropriate policies for admin access

  3. Notes
    - Vouchers can be fixed amount or percentage-based
    - Usage tracking allows seeing which bookings used which vouchers
    - Supports expiry dates and usage limits
*/

CREATE TABLE IF NOT EXISTS vouchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  discount_type text NOT NULL CHECK (discount_type IN ('fixed', 'percentage')),
  discount_value numeric NOT NULL CHECK (discount_value > 0),
  min_spend numeric DEFAULT 0 NOT NULL CHECK (min_spend >= 0),
  usage_limit integer CHECK (usage_limit IS NULL OR usage_limit > 0),
  usage_count integer DEFAULT 0 NOT NULL CHECK (usage_count >= 0),
  expires_at timestamptz,
  is_active boolean DEFAULT true NOT NULL,
  created_by uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT percentage_max CHECK (
    discount_type != 'percentage' OR discount_value <= 100
  )
);

CREATE TABLE IF NOT EXISTS voucher_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id uuid NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  discount_applied numeric NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(voucher_id, booking_id)
);

ALTER TABLE vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE voucher_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active vouchers"
  ON vouchers
  FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admin users can read all vouchers"
  ON vouchers
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
      AND admin_users.is_active = true
    )
  );

CREATE POLICY "Admin users can insert vouchers"
  ON vouchers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
      AND admin_users.is_active = true
    )
  );

CREATE POLICY "Admin users can update vouchers"
  ON vouchers
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
      AND admin_users.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
      AND admin_users.is_active = true
    )
  );

CREATE POLICY "Admin users can delete vouchers"
  ON vouchers
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
      AND admin_users.is_active = true
    )
  );

CREATE POLICY "Admin users can read voucher usage"
  ON voucher_usage
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
      AND admin_users.is_active = true
    )
  );

CREATE POLICY "Voucher usage can be inserted"
  ON voucher_usage
  FOR INSERT
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_vouchers_code ON vouchers(code);
CREATE INDEX IF NOT EXISTS idx_vouchers_active ON vouchers(is_active);
CREATE INDEX IF NOT EXISTS idx_voucher_usage_voucher_id ON voucher_usage(voucher_id);
CREATE INDEX IF NOT EXISTS idx_voucher_usage_booking_id ON voucher_usage(booking_id);

CREATE OR REPLACE FUNCTION update_vouchers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'vouchers_updated_at'
  ) THEN
    CREATE TRIGGER vouchers_updated_at
      BEFORE UPDATE ON vouchers
      FOR EACH ROW
      EXECUTE FUNCTION update_vouchers_updated_at();
  END IF;
END $$;
