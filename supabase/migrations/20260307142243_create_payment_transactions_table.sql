/*
  # Create payment_transactions table for Payfast tracking

  1. New Tables
    - `payment_transactions`
      - `id` (uuid, primary key) - Internal transaction ID
      - `booking_id` (uuid, foreign key) - References the booking
      - `payment_id` (text) - Payfast payment ID (pf_payment_id from ITN)
      - `merchant_transaction_id` (text) - Our reference sent to Payfast (m_payment_id)
      - `status` (enum) - Transaction status
      - `amount` (numeric) - Payment amount
      - `amount_gross` (numeric) - Gross amount from Payfast
      - `amount_fee` (numeric) - Payfast fee
      - `amount_net` (numeric) - Net amount received
      - `payment_method` (text) - Payment method used (cc, eft, etc)
      - `payment_status` (text) - Raw Payfast payment_status value
      - `item_name` (text) - Service description sent to Payfast
      - `item_description` (text) - Additional description
      - `name_first` (text) - Customer first name
      - `name_last` (text) - Customer last name
      - `email_address` (text) - Customer email
      - `merchant_id` (text) - Payfast merchant ID
      - `signature` (text) - Payfast signature for verification
      - `raw_itn_data` (jsonb) - Complete ITN payload for debugging
      - `created_at` (timestamp) - When transaction was initiated
      - `updated_at` (timestamp) - Last update timestamp
  
  2. Security
    - Enable RLS on `payment_transactions` table
    - No public access - only service role can write
    - Authenticated users can view their own transaction status (future)
  
  3. Indexes
    - Index on booking_id for fast lookups
    - Index on payment_id for ITN processing
    - Index on merchant_transaction_id for reference tracking
  
  4. Purpose
    - Track all payment attempts and their lifecycle
    - Store ITN data for reconciliation and debugging
    - Link Payfast payments back to bookings
    - Maintain audit trail of payment status changes
*/

-- Create payment status enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_transaction_status') THEN
    CREATE TYPE payment_transaction_status AS ENUM (
      'initiated',
      'pending',
      'complete',
      'failed',
      'cancelled'
    );
  END IF;
END $$;

-- Create payment_transactions table
CREATE TABLE IF NOT EXISTS payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  payment_id text,
  merchant_transaction_id text NOT NULL,
  status payment_transaction_status NOT NULL DEFAULT 'initiated',
  amount numeric NOT NULL,
  amount_gross numeric,
  amount_fee numeric,
  amount_net numeric,
  payment_method text,
  payment_status text,
  item_name text NOT NULL,
  item_description text,
  name_first text,
  name_last text,
  email_address text,
  merchant_id text,
  signature text,
  raw_itn_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_payment_transactions_booking_id ON payment_transactions(booking_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_payment_id ON payment_transactions(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_merchant_transaction_id ON payment_transactions(merchant_transaction_id);

-- Enable RLS
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (for API routes)
CREATE POLICY "Service role has full access to payment_transactions"
  ON payment_transactions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Update updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'update_payment_transactions_updated_at'
  ) THEN
    CREATE TRIGGER update_payment_transactions_updated_at
      BEFORE UPDATE ON payment_transactions
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
