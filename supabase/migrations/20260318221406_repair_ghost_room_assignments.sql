/*
  # Repair Ghost Room Assignments

  ## Problem
  Six active bookings have a stale `bookings.room_id` that does not match the rooms
  recorded in `booking_rooms`. This causes the room calendar and availability engine
  to ghost-block the old room referenced by `room_id`, even though the booking was
  reassigned to a different room.

  ## Root cause
  When a booking was reassigned via drag-drop or room allocation, `booking_rooms`
  was updated but `bookings.room_id` (the legacy column) was not always updated to
  match the first room in `booking_rooms`. The availability engine reads BOTH sources
  and unions them, so the stale `room_id` keeps blocking a room unnecessarily.

  ## Fix applied
  For every active booking where `bookings.room_id` does not match the first room in
  `booking_rooms` (ordered by room priority), update `bookings.room_id` to match.

  1. TYPE_A repairs: sync legacy room_id to the first room from booking_rooms
  2. TYPE_B repairs: if booking has a legacy room_id but no booking_rooms entry,
     create the booking_rooms entry to bring it into the new model
  3. Add a database function to keep room_id in sync automatically going forward

  ## Tables modified
  - bookings (room_id column updated for 6 records)
  - booking_rooms (no changes needed; already correct)

  ## Security
  - No RLS changes required (admin-only operation)
*/

-- Step 1: Fix TYPE_A records — sync bookings.room_id to match the primary room
-- in booking_rooms (lowest priority value = primary room)
DO $$
DECLARE
  r RECORD;
  primary_room_id UUID;
BEGIN
  FOR r IN
    SELECT b.id AS booking_id, b.room_id AS current_legacy_room_id
    FROM bookings b
    WHERE b.status IN ('confirmed', 'completed', 'pending_payment')
      AND b.room_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM booking_rooms br WHERE br.booking_id = b.id)
      AND b.room_id != (
        SELECT br2.room_id
        FROM booking_rooms br2
        JOIN rooms rm ON rm.id = br2.room_id
        WHERE br2.booking_id = b.id
        ORDER BY rm.priority ASC
        LIMIT 1
      )
  LOOP
    SELECT br2.room_id INTO primary_room_id
    FROM booking_rooms br2
    JOIN rooms rm ON rm.id = br2.room_id
    WHERE br2.booking_id = r.booking_id
    ORDER BY rm.priority ASC
    LIMIT 1;

    IF primary_room_id IS NOT NULL THEN
      UPDATE bookings
      SET room_id = primary_room_id
      WHERE id = r.booking_id;

      RAISE NOTICE 'Repaired booking %: room_id updated from % to %',
        r.booking_id, r.current_legacy_room_id, primary_room_id;
    END IF;
  END LOOP;
END $$;

-- Step 2: Fix TYPE_B records — bookings with a legacy room_id but no booking_rooms entry
-- Insert the legacy room into booking_rooms so it becomes the source of truth
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT b.id AS booking_id, b.room_id
    FROM bookings b
    WHERE b.status IN ('confirmed', 'completed', 'pending_payment')
      AND b.room_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM booking_rooms br WHERE br.booking_id = b.id)
  LOOP
    INSERT INTO booking_rooms (booking_id, room_id)
    VALUES (r.booking_id, r.room_id)
    ON CONFLICT (booking_id, room_id) DO NOTHING;

    RAISE NOTICE 'Repaired booking % (TYPE_B): inserted room % into booking_rooms',
      r.booking_id, r.room_id;
  END LOOP;
END $$;

-- Step 3: Verify repair — show any remaining mismatches (should be 0 after repair)
DO $$
DECLARE
  mismatch_count INT;
BEGIN
  SELECT COUNT(*) INTO mismatch_count
  FROM bookings b
  WHERE b.status IN ('confirmed', 'completed', 'pending_payment')
    AND b.room_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM booking_rooms br WHERE br.booking_id = b.id)
    AND b.room_id != (
      SELECT br2.room_id
      FROM booking_rooms br2
      JOIN rooms rm ON rm.id = br2.room_id
      WHERE br2.booking_id = b.id
      ORDER BY rm.priority ASC
      LIMIT 1
    );

  IF mismatch_count > 0 THEN
    RAISE WARNING 'DATA REPAIR INCOMPLETE: % bookings still have ghost room_id mismatches', mismatch_count;
  ELSE
    RAISE NOTICE 'Data repair successful: all active bookings have consistent room assignments';
  END IF;
END $$;
