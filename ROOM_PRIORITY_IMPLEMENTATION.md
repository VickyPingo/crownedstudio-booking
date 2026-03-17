# Room Priority Implementation

## Overview
Room allocation has been updated to prioritize Room 1 and Room 3 first. These rooms are now filled before other rooms are used.

## Priority System

### Room Priority Order (Lowest Number = Highest Priority)
1. **Room 1** - Priority: 1 (2-bed treatment room)
2. **Room 3** - Priority: 2 (3-bed treatment room)
3. **Room 2** - Priority: 3
4. **Room 4** - Priority: 4
5. **Other rooms** - Priority: 5+

## How It Works

### Existing Allocation Logic (No Code Changes Required)
The room allocation system in `lib/roomAllocation.ts` already implements priority-based allocation:

```typescript
// Line 62: allocateRoom function
.order('priority', { ascending: true })

// Line 140: getRoomsForDate function
.order('priority', { ascending: true })
```

This means:
- Rooms are **always** sorted by priority in ascending order (1, 2, 3, 4...)
- The allocation loop checks rooms in priority order
- First available room that matches criteria is assigned
- **Room 1 is checked first, then Room 3, then other rooms**

### Allocation Flow

1. **Query Phase**
   - System queries all active rooms matching service area
   - Rooms with sufficient capacity (>= people_count)
   - Results sorted by priority ascending

2. **Availability Check Phase**
   - System iterates through rooms in priority order
   - For each room, checks for time conflicts
   - Applies 10-minute cleanup buffer between bookings

3. **Assignment Phase**
   - First room without conflicts is assigned
   - Room 1 gets first chance (priority 1)
   - If Room 1 occupied, Room 3 checked next (priority 2)
   - Other rooms only used if Room 1 and Room 3 unavailable

## Database Migration Required

To implement this priority system, run the following SQL migration:

### Migration: Update Room Priorities

```sql
/*
  # Update Room Priorities - Prioritize Room 1 and Room 3

  This migration ensures Room 1 and Room 3 are filled first
  by setting them to the lowest priority numbers (highest priority).
*/

-- Room 1: Highest priority
UPDATE rooms SET priority = 1 WHERE room_name = 'Room 1';

-- Room 3: Second highest priority
UPDATE rooms SET priority = 2 WHERE room_name = 'Room 3';

-- Room 2: Third priority
UPDATE rooms SET priority = 3 WHERE room_name = 'Room 2';

-- Room 4: Fourth priority
UPDATE rooms SET priority = 4 WHERE room_name = 'Room 4';

-- Any other rooms: Lower priority
UPDATE rooms
SET priority = 5
WHERE room_name NOT IN ('Room 1', 'Room 2', 'Room 3', 'Room 4')
  AND (priority IS NULL OR priority > 4);
```

### Migration File
Location: `supabase/migrations/20260317150000_update_room_priorities.sql`

## Verification Steps

After applying the migration, verify the system works correctly:

### 1. Check Room Priorities
```sql
SELECT room_name, priority, capacity, room_area, active
FROM rooms
ORDER BY priority ASC;
```

Expected result:
```
room_name | priority | capacity | room_area | active
----------|----------|----------|-----------|-------
Room 1    | 1        | 2        | treatment | true
Room 3    | 2        | 3        | treatment | true
Room 2    | 3        | 2        | treatment | true
Room 4    | 4        | 1        | treatment | true
```

### 2. Test Allocation Behavior
- Create a new booking for 2 people
- Verify Room 1 is assigned (if available)
- Block Room 1 with another booking
- Create another booking for 2 people
- Verify Room 3 is assigned (if Room 1 occupied)
- Only when both Room 1 and Room 3 are full should Room 2 be used

### 3. Check Admin Dashboard
- Navigate to `/admin/rooms`
- Rooms should display in priority order:
  1. Room 1
  2. Room 3
  3. Room 2
  4. Room 4

## Constraints Preserved

All existing booking rules remain in effect:
- ✅ Room capacity must accommodate people count
- ✅ Room area must match service requirement (treatment/public)
- ✅ No overlapping bookings in same room
- ✅ 10-minute cleanup buffer between bookings
- ✅ Pending payment bookings hold room until expiry
- ✅ Confirmed bookings block room slots

## Multi-Person Booking Support

Priority system works correctly with multi-person bookings:
- If booking requires 3 people and Room 1 (capacity 2) is available → **Skip to Room 3**
- If booking requires 2 people and Room 3 (capacity 3) is available → **Still use Room 3** (based on priority, not capacity match)
- System always uses first available room in priority order that meets capacity requirement

## Impact on Booking Flows

### Automatic Room Assignment (Public Booking)
When customers book through the website:
1. Service area determined from service selection
2. Room allocation called with date/time/people count
3. System checks Room 1 first
4. If unavailable, checks Room 3
5. Falls back to other rooms only if needed

### Manual Room Assignment (Admin)
When admins create or modify bookings:
1. Can override automatic assignment
2. Can manually select any room
3. Automatic assignment still follows priority order
4. Admin dashboard displays rooms in priority order

### Reschedule Operations
When bookings are rescheduled:
1. Old room is released
2. New room allocated using priority system
3. Room 1 and Room 3 checked first for new time slot
4. May result in different room if priorities changed

## Benefits

### Operational Efficiency
- Room 1 and Room 3 used consistently
- Reduces room setup/cleanup overhead
- Other rooms kept available for peak times

### Predictability
- Staff knows Room 1 and Room 3 will be primary rooms
- Easier to plan staffing and supplies
- Consistent customer experience

### Flexibility
- Priority can be updated without code changes
- Just run new migration to change room order
- System adapts automatically

## Troubleshooting

### Issue: Wrong room assigned
**Check:**
1. Verify room priorities in database
2. Ensure Room 1 and Room 3 have priority 1 and 2
3. Check if rooms are marked active
4. Verify room capacity meets booking needs

### Issue: Room 1 never used
**Check:**
1. Room 1 may be marked inactive
2. Room area may not match service requirement
3. Room capacity may be insufficient
4. Time slot may always have conflicts

### Issue: Allocation fails
**Check:**
1. All priority rooms may be fully booked
2. Check for expired pending payments holding slots
3. Verify cleanup buffer calculations
4. Review booking status filters

## Code References

### Room Allocation Logic
**File:** `lib/roomAllocation.ts`

Key functions:
- `allocateRoom()` - Lines 39-123
  - Queries rooms sorted by priority (line 62)
  - Checks availability in priority order (lines 104-119)

- `getRoomsForDate()` - Lines 125-159
  - Fetches rooms with priority sorting (line 140)
  - Used by admin calendar view

### Admin UI
**File:** `app/admin/rooms/page.tsx`
- Displays rooms in priority order (line 87)
- Used for calendar visualization

**File:** `components/admin/BookingDetailDrawer.tsx`
- Shows room assignment in booking details
- Allows manual room override
- Fetches rooms with priority sorting (line 164)

## Migration History

- **20260312212756** - Added room_id to bookings table
- **20260317150000** - Updated room priorities (Room 1 and Room 3 first)
