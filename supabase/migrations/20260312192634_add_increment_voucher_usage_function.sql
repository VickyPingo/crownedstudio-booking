/*
  # Add Increment Voucher Usage Function

  1. New Function
    - `increment_voucher_usage` - Increments the usage_count of a voucher by 1

  2. Notes
    - Used when a booking with a voucher is created
    - Atomic operation to prevent race conditions
*/

CREATE OR REPLACE FUNCTION increment_voucher_usage(voucher_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE vouchers
  SET usage_count = usage_count + 1
  WHERE id = voucher_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
