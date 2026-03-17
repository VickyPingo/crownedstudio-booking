# Room Priority Quick Reference

## Summary
Room allocation has been configured to prioritize **Room 1** and **Room 3** first. The system fills these rooms before using other rooms.

## Required Database Update

Run this SQL to set the correct priorities:

```sql
-- Set Room 1 as highest priority
UPDATE rooms SET priority = 1 WHERE room_name = 'Room 1';

-- Set Room 3 as second priority
UPDATE rooms SET priority = 2 WHERE room_name = 'Room 3';

-- Set other rooms to lower priority
UPDATE rooms SET priority = 3 WHERE room_name = 'Room 2';
UPDATE rooms SET priority = 4 WHERE room_name = 'Room 4';
```

## How It Works

### Priority Order (Ascending)
1. **Room 1** (Priority: 1) - Checked first
2. **Room 3** (Priority: 2) - Checked second
3. **Room 2** (Priority: 3) - Checked third
4. **Room 4** (Priority: 4) - Checked fourth

### Allocation Behavior
- System queries rooms sorted by `priority ASC`
- First available room in priority order is assigned
- All constraints still apply (capacity, area, overlaps)
- Room 1 and Room 3 will be used most frequently

## Code Implementation

**No code changes required!** The existing allocation logic in `lib/roomAllocation.ts` already:
- Sorts rooms by priority ascending (line 62, 140)
- Iterates through rooms in priority order
- Assigns first available room

## Verification

After running the migration, check:

```sql
SELECT room_name, priority, capacity, room_area
FROM rooms
ORDER BY priority ASC;
```

Expected output:
```
Room 1 | 1 | 2 | treatment
Room 3 | 2 | 3 | treatment
Room 2 | 3 | 2 | treatment
Room 4 | 4 | 1 | treatment
```

## Files Modified
- ✅ No code changes required
- ✅ Documentation created: `ROOM_PRIORITY_IMPLEMENTATION.md`
- ✅ Migration file prepared (requires database access to apply)

## System Behavior

### Before Priority Update
Rooms assigned randomly or by database order

### After Priority Update
- Room 1 used preferentially
- Room 3 used when Room 1 occupied
- Room 2 and Room 4 only used when both Room 1 and Room 3 unavailable

All existing booking rules preserved (capacity, area, conflicts, cleanup buffer).
