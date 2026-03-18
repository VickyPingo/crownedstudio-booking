/*
  # Update Room Priorities for Controlled Scheduling System

  1. Changes
    - Updates room priorities to match strict group ordering for controlled scheduling
    - Group 1 (priorities 1-2): Room 3, Room 4
    - Group 2 (priorities 3-4): Room 1, Room 2
    - Group 3 (priorities 5-6): Room 5, Room 6

  2. New Priority Structure
    - Room 3: priority 1 (Group 1, capacity 3)
    - Room 4: priority 2 (Group 1, capacity 3)
    - Room 1: priority 3 (Group 2, capacity 2)
    - Room 2: priority 4 (Group 2, capacity 2)
    - Room 5: priority 5 (Group 3, capacity 2)
    - Room 6: priority 6 (Group 3, capacity 2)

  3. Purpose
    - Enables downward-filling scheduling from 08:30
    - Ensures rooms are used in strict group order
    - Next group only opens when current group has no valid time slot
*/

-- First, shift all priorities to temporary high values to avoid conflicts
UPDATE rooms SET priority = 100 WHERE room_name = 'Room 1' AND room_area = 'treatment';
UPDATE rooms SET priority = 101 WHERE room_name = 'Room 2' AND room_area = 'treatment';
UPDATE rooms SET priority = 102 WHERE room_name = 'Room 3' AND room_area = 'treatment';
UPDATE rooms SET priority = 103 WHERE room_name = 'Room 4' AND room_area = 'treatment';
UPDATE rooms SET priority = 104 WHERE room_name = 'Room 5' AND room_area = 'treatment';
UPDATE rooms SET priority = 105 WHERE room_name = 'Room 6' AND room_area = 'treatment';

-- Now apply the correct priorities
UPDATE rooms SET priority = 1 WHERE room_name = 'Room 3' AND room_area = 'treatment';
UPDATE rooms SET priority = 2 WHERE room_name = 'Room 4' AND room_area = 'treatment';
UPDATE rooms SET priority = 3 WHERE room_name = 'Room 1' AND room_area = 'treatment';
UPDATE rooms SET priority = 4 WHERE room_name = 'Room 2' AND room_area = 'treatment';
UPDATE rooms SET priority = 5 WHERE room_name = 'Room 5' AND room_area = 'treatment';
UPDATE rooms SET priority = 6 WHERE room_name = 'Room 6' AND room_area = 'treatment';