/*
  # Fix Booking Time Rules for Crowned Night Services

  1. Problem
    - The enforce_booking_time_rules trigger had a hardcoded check blocking bookings ending after 20:00
    - Crowned Night A and B services have service_time_windows of 17:30-20:30
    - The hardcoded 20:00 check blocked valid Crowned Night bookings that end at 20:30

  2. Solution
    - Remove the hardcoded 20:00 end time check
    - The service_time_window end_cap already correctly enforces the appropriate end time for each service
    - For normal services: end_cap = business_hours.close_time or after_hours_end_time
    - For Crowned Night: end_cap = 20:30 from their service_time_windows

  3. Changes
    - Updated enforce_booking_time_rules function to remove redundant 20:00 check
*/

CREATE OR REPLACE FUNCTION public.enforce_booking_time_rules()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
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
$function$;
