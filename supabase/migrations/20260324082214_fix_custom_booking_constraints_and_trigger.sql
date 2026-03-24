/*
  # Fix custom booking database constraints and trigger

  ## Root Cause
  Custom bookings were failing with "Invalid service_slug: <NULL>" because:
  1. `service_slug` column was NOT NULL — cannot be null for custom bookings
  2. `enforce_booking_time_rules` trigger unconditionally looks up the service by slug
     and raises an exception if not found — must skip this check for custom bookings
  3. `custom_price` column was referenced in a CHECK constraint but never added as a column

  ## Changes

  ### Modified Columns on `bookings`
  - `service_slug` — changed from NOT NULL to nullable (custom bookings have no service)

  ### New Column on `bookings`
  - `custom_price` (numeric, nullable) — the manually set price for a custom booking

  ### Modified Trigger Function: `enforce_booking_time_rules`
  - When `is_custom_booking = true`, skip the service lookup and time-window validation
  - Only applies the full service/time-window checks for normal (non-custom) bookings
  - All other checks (end_time > start_time, 10-minute boundary) still apply to ALL bookings

  ## Notes
  - Existing bookings are unaffected; service_slug is still required for normal bookings
    at the application layer (not the DB layer).
  - The CHECK constraint on custom_price (>= 0) was already present from a prior migration.
*/

-- 1. Make service_slug nullable
ALTER TABLE bookings ALTER COLUMN service_slug DROP NOT NULL;

-- 2. Add custom_price column if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'custom_price'
  ) THEN
    ALTER TABLE bookings ADD COLUMN custom_price numeric NULL;
  END IF;
END $$;

-- 3. Fix the trigger function to skip service/time-window validation for custom bookings
CREATE OR REPLACE FUNCTION public.enforce_booking_time_rules()
RETURNS trigger
LANGUAGE plpgsql
AS $$
declare
svc record;
bh record;
window_rec record;
dow int;
start_cap time;
end_cap time;
begin
if new.end_time <= new.start_time then
  raise exception 'Booking end_time must be after start_time';
end if;

if extract(second from new.start_time) <> 0
or (extract(minute from new.start_time)::int % 10) <> 0 then
  raise exception 'Booking start_time must be on a 10-minute boundary';
end if;

-- Skip service and time-window validation for custom bookings
if new.is_custom_booking = true then
  return new;
end if;

select * into svc from public.services where slug = new.service_slug;
if not found then raise exception 'Invalid service_slug: %', new.service_slug; end if;

dow := extract(dow from (new.start_time at time zone 'Africa/Johannesburg'))::int;

select * into bh from public.business_hours where day_of_week = dow;
if not found then raise exception 'No business_hours for day_of_week=%', dow; end if;

start_cap := bh.open_time;

if svc.after_hours_allowed then
  end_cap := coalesce(bh.after_hours_end_time, time '20:00');
else
  end_cap := bh.close_time;
end if;

select stw.* into window_rec
from public.service_time_windows stw
where stw.service_slug = svc.slug
and (stw.days_allowed = 'ALL' or position(public.day_abbrev(dow) in upper(stw.days_allowed)) > 0)
order by stw.start_time asc
limit 1;

if found then
  start_cap := window_rec.start_time;
  end_cap := window_rec.end_time;
end if;

if (new.start_time at time zone 'Africa/Johannesburg')::time < start_cap then
  raise exception 'Booking starts before allowed time window (%).', start_cap;
end if;

if (new.end_time at time zone 'Africa/Johannesburg')::time > end_cap then
  raise exception 'Booking ends after allowed time window (%).', end_cap;
end if;

return new;
end;
$$;
