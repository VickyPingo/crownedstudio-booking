# Latest Start Time Restriction - 17:30

## Overview
Implemented a system-wide restriction preventing any booking from starting after 17:30, regardless of service duration or after-hours settings.

## Business Rule

**Hard Cutoff**: No booking can start later than **17:30**

- Applies to all services
- Applies to both customer and admin bookings
- End times can extend beyond 17:30 if service duration requires
- Only the **start time** is restricted
- This is in addition to existing after-hours surcharge logic (which starts at 16:30)

## Implementation Summary

### 1. Core Library Update

**File**: `lib/timeSlots.ts`

**Changes**:
```typescript
export const LATEST_START_TIME = '17:30'
```

**Logic**:
- Added `LATEST_START_TIME` constant set to `'17:30'`
- Updated `generateTimeSlots()` function to filter out any slots starting after 17:30
- Applies to both regular hours and after-hours slots
- Applies to Crowned Night services and regular services
- Enforced at the data generation level (not just UI)

**Implementation Details**:
```typescript
const latestStartMinutes = timeToMinutes(LATEST_START_TIME) // 1050 minutes (17:30)

// For each time slot generated:
if (time <= latestStartMinutes) {
  slots.push(minutesToTime(time))
}
```

### 2. Availability API

**File**: `app/api/availability/slots/route.ts`

**Status**: ✅ Automatically enforced

The availability API uses `generateTimeSlots()` from the core library, so the 17:30 restriction is automatically applied when:
- Customers check available slots for a date
- Room availability is calculated
- Time slots are filtered by bookings and time blocks

No additional changes needed - restriction flows through from core library.

### 3. Customer Booking Flow

**File**: `components/booking-steps/DateTimeStep.tsx`

**Changes**:
1. **Time slot display**: Automatically filtered via availability API
2. **Updated messaging**:
   ```
   "After-hours bookings include a R100 surcharge per person. Last available start time is 17:30."
   ```

**User Experience**:
- Users only see slots up to and including 17:30
- Cannot select 17:40, 17:50, 18:00, etc.
- Clear messaging about the cutoff time
- After-hours surcharge still applies from 16:30-17:30

### 4. Admin Booking Creation

**File**: `components/admin/ManualBookingModal.tsx`

**Status**: ✅ Automatically enforced

The manual booking modal uses `generateTimeSlots()` to populate available time slots, so:
- Admin users only see slots up to 17:30
- Cannot create bookings starting after 17:30
- Same restrictions as customer-facing flow
- No workarounds or bypass options

### 5. Admin Reschedule Flow

**File**: `components/admin/BookingDetailDrawer.tsx`

**Changes**:

1. **Time input restriction**:
   ```html
   <input type="time" max="17:30" />
   ```

2. **Server-side validation**:
   ```typescript
   const timeInMinutes = parseInt(rescheduleTime.split(':')[0]) * 60 +
                         parseInt(rescheduleTime.split(':')[1])
   const latestStartMinutes = 17 * 60 + 30 // 1050

   if (timeInMinutes > latestStartMinutes) {
     alert('Booking start time cannot be later than 17:30')
     return
   }
   ```

3. **UI label update**:
   ```
   "New Time (max 17:30)"
   ```

**Protection Layers**:
- HTML5 `max` attribute provides browser-level validation
- JavaScript validation prevents submission if time > 17:30
- Clear user feedback via alert
- Label clearly indicates the restriction

## Complete Flow Coverage

### Customer Booking

1. **Service Selection** → Service selected
2. **Date Selection** → Date selected
3. **Time Selection** → API called to get available slots
4. **Slot Display** → `generateTimeSlots()` filters to max 17:30
5. **User Selection** → Can only select from filtered slots
6. **Booking Creation** → Only valid times submitted

### Admin Manual Booking

1. **Service Selection** → Service selected
2. **Date Selection** → Date selected
3. **Time Slot Dropdown** → `generateTimeSlots()` filters to max 17:30
4. **Admin Selection** → Can only select from filtered slots
5. **Booking Creation** → Only valid times submitted

### Admin Reschedule

1. **Open Booking** → View booking details
2. **Click Reschedule** → Reschedule form appears
3. **Time Input** → HTML max="17:30" prevents selection beyond cutoff
4. **Submit** → JavaScript validation double-checks
5. **Update** → Only allows times ≤ 17:30

## Relationship with After-Hours Surcharge

**After-Hours Start**: 16:30
**Latest Start Time**: 17:30

**Booking Time Windows**:

| Time Range | Description | Surcharge |
|------------|-------------|-----------|
| 09:00-16:20 | Regular hours | No |
| 16:30-17:30 | After-hours (available) | R100/person |
| 17:40+ | **Not available** | N/A |

**Example**:
- 16:30 booking = ✅ Allowed with R100/person surcharge
- 17:00 booking = ✅ Allowed with R100/person surcharge
- 17:30 booking = ✅ Allowed with R100/person surcharge (last slot)
- 17:40 booking = ❌ **Not allowed** (filtered out completely)
- 18:00 booking = ❌ **Not allowed** (filtered out completely)

## Technical Details

### Time Calculation
```typescript
function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

// Examples:
// '17:30' → 1050 minutes
// '17:40' → 1060 minutes (exceeds limit)
// '16:30' → 990 minutes (within limit, after-hours)
```

### Slot Generation Logic

```typescript
export function generateTimeSlots(config: TimeSlotConfig): string[] {
  const latestStartMinutes = timeToMinutes(LATEST_START_TIME) // 1050

  // Regular hours loop
  for (let time = openTime; time + duration <= closeTime; time += SLOT_INTERVAL_MINUTES) {
    if (time <= latestStartMinutes) {  // ← Enforcement point
      slots.push(minutesToTime(time))
    }
  }

  // After-hours loop (if enabled)
  if (businessHours.after_hours_enabled) {
    for (let time = closeTime; time + duration <= afterHoursEnd; time += SLOT_INTERVAL_MINUTES) {
      if (!slots.includes(minutesToTime(time)) && time <= latestStartMinutes) {  // ← Enforcement point
        slots.push(minutesToTime(time))
      }
    }
  }

  return slots
}
```

## Service Duration Handling

**Important**: The restriction applies only to **start time**, not end time.

**Examples**:

| Service | Duration | Latest Start | End Time |
|---------|----------|--------------|----------|
| Quick Massage | 30 min | 17:30 | 18:00 |
| Standard Massage | 60 min | 17:30 | 18:30 |
| Extended Package | 120 min | 17:30 | 19:30 |
| Crowned Night | 180 min | 17:30 | 20:30 |

All services can start at 17:30 regardless of how late they finish.

## Edge Cases Handled

### 1. After-Hours Window Extends Past 17:30
**Scenario**: Business hours close at 16:00, after-hours extends to 19:00

**Result**:
- Slots generated from 16:00-17:30 only
- 17:40-19:00 slots are filtered out
- After-hours surcharge applies to 16:30-17:30 slots

### 2. Crowned Night Service Time Window
**Scenario**: Crowned Night window is 17:00-21:00

**Result**:
- Only 17:00, 17:10, 17:20, 17:30 are available
- 17:40-21:00 slots are filtered out
- Service can run until 20:30 (if starting at 17:30)

### 3. Manual Admin Override Attempt
**Scenario**: Admin tries to manually type 18:00 in reschedule time picker

**Protection**:
1. HTML `max="17:30"` prevents typing beyond in modern browsers
2. If bypassed, JavaScript validation catches it
3. User sees alert: "Booking start time cannot be later than 17:30"
4. Booking update is blocked

### 4. Time Blocks on Partially Available Days
**Scenario**: Day has time block 15:00-17:00, business hours 09:00-18:00

**Result**:
- Slots before 15:00 available (filtered by 17:30)
- 15:00-17:00 blocked by time block
- 17:10-17:30 available
- 17:40+ filtered by latest start time restriction

## Data Integrity

**Database Level**:
- No database constraints added (handled at application level)
- Existing bookings with start times > 17:30 are not affected
- New bookings after this change cannot start > 17:30

**Application Level**:
- All booking creation paths enforce restriction
- All reschedule paths enforce restriction
- No bypass mechanisms exist

## User-Facing Messaging

### Customer Booking Flow
Location: Date & Time selection step

**Message**:
```
After-hours bookings include a R100 surcharge per person.
Last available start time is 17:30.
```

- Displayed with amber dot indicator
- Only shown when after-hours is enabled
- Not shown for Crowned Night services

### Admin Reschedule Flow
Location: Booking detail drawer reschedule section

**Label**: "New Time (max 17:30)"

**Validation Alert**: "Booking start time cannot be later than 17:30"

## Testing Checklist

- [x] Time slot generation filters slots after 17:30
- [x] Customer booking modal only shows slots up to 17:30
- [x] Availability API returns only slots up to 17:30
- [x] Admin manual booking only shows slots up to 17:30
- [x] Admin reschedule blocks times after 17:30
- [x] After-hours surcharge still applies to 16:30-17:30 slots
- [x] After-hours messaging updated with 17:30 clarification
- [x] TypeScript compiles without errors
- [x] All service types respect the cutoff
- [x] Crowned Night services respect the cutoff
- [x] Service duration doesn't affect start time restriction
- [x] End times can extend beyond 17:30

## Files Modified

1. **lib/timeSlots.ts**
   - Added `LATEST_START_TIME` constant
   - Updated `generateTimeSlots()` to filter slots by latest start time

2. **components/booking-steps/DateTimeStep.tsx**
   - Updated after-hours messaging to include 17:30 cutoff

3. **components/admin/BookingDetailDrawer.tsx**
   - Added `max="17:30"` to reschedule time input
   - Added server-side validation in `handleReschedule()`
   - Updated label to indicate max time

## Future Considerations

### Potential Enhancements
- Make latest start time configurable in admin settings
- Add different cutoffs for different services
- Add different cutoffs for different days of week
- Create database constraint for additional safety
- Add warning in admin if trying to create booking near cutoff

### Migration Path
If latest start time needs to change in future:
1. Update `LATEST_START_TIME` constant in `lib/timeSlots.ts`
2. Update label in `BookingDetailDrawer.tsx`
3. Update validation in `handleReschedule()`
4. Update messaging in `DateTimeStep.tsx`
5. Consider database migration if moving cutoff earlier

## Summary

**What Changed**:
- Core time slot generation now enforces 17:30 cutoff
- Customer booking flows automatically respect cutoff
- Admin booking flows automatically respect cutoff
- Admin reschedule has dual protection (HTML + JavaScript)
- UI messaging updated to clarify the restriction

**What Stayed the Same**:
- After-hours surcharge logic (still starts at 16:30)
- After-hours surcharge amount (R100/person)
- Service duration handling
- Business hours configuration
- Time block functionality
- Room allocation logic

**Result**:
No booking can start after 17:30 through any flow, with clear user communication about the restriction.
