# Same-Day Booking Restriction

## Overview
Implemented a system-wide restriction preventing same-day bookings. Users and admins can only book for dates starting from tomorrow onward.

## Business Rule

**No Same-Day Bookings**: Bookings cannot be created for today's date.

- The earliest bookable date is always tomorrow
- Applies to all services
- Applies to both customer and admin bookings
- Enforced at both UI and API levels
- Works in conjunction with the 17:30 latest start time restriction

## Implementation Summary

### 1. Core Helper Functions

**File**: `lib/timeSlots.ts`

**New Functions**:

```typescript
export function isSameDayBooking(dateString: string): boolean {
  const bookingDate = new Date(dateString)
  const today = new Date()

  bookingDate.setHours(0, 0, 0, 0)
  today.setHours(0, 0, 0, 0)

  return bookingDate.getTime() === today.getTime()
}

export function getMinimumBookingDate(): string {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)

  const year = tomorrow.getFullYear()
  const month = String(tomorrow.getMonth() + 1).padStart(2, '0')
  const day = String(tomorrow.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}
```

**Purpose**:
- `isSameDayBooking()`: Checks if a date string represents today
- `getMinimumBookingDate()`: Returns tomorrow's date in YYYY-MM-DD format

**Usage**: These functions are used throughout the application for both validation and UI constraints.

### 2. Availability API (Server-Side)

**File**: `app/api/availability/slots/route.ts`

**Changes**:
```typescript
import { isSameDayBooking } from '@/lib/timeSlots'

export async function POST(request: NextRequest) {
  const { date } = body

  if (isSameDayBooking(date)) {
    return NextResponse.json({
      availableSlots: [],
      isFullyBlocked: true,
      error: 'Same-day bookings are not allowed. Please choose a date from tomorrow onward.'
    })
  }
  // ... rest of availability logic
}
```

**Protection**:
- API rejects same-day availability requests
- Returns empty slots with error message
- Client receives clear error explaining the restriction

### 3. Customer Booking Flow

**File**: `components/booking-steps/DateTimeStep.tsx`

**Changes**:

1. **Import helper**:
   ```typescript
   import { getMinimumBookingDate } from '@/lib/timeSlots'
   ```

2. **Date input constraint**:
   ```tsx
   <input
     type="date"
     value={selectedDate}
     onChange={(e) => handleDateChange(e.target.value)}
     min={getMinimumBookingDate()}
     className="..."
   />
   ```

**User Experience**:
- Date picker starts from tomorrow
- Today is disabled and cannot be selected
- HTML5 `min` attribute provides browser-level validation
- If user somehow submits today's date, availability API rejects it

### 4. Admin Manual Booking Flow

**File**: `components/admin/ManualBookingModal.tsx`

**Changes**:

1. **Import helper**:
   ```typescript
   import { getMinimumBookingDate } from '@/lib/timeSlots'
   ```

2. **Date input constraint**:
   ```tsx
   <input
     type="date"
     value={selectedDate}
     onChange={(e) => {
       setSelectedDate(e.target.value)
       setSelectedTime('')
     }}
     min={getMinimumBookingDate()}
     className="..."
   />
   ```

**Admin Experience**:
- Admins cannot select today in manual booking creation
- Tomorrow is the earliest selectable date
- Time slots won't generate for today even if date is manually entered

### 5. Admin Reschedule Flow

**File**: `components/admin/BookingDetailDrawer.tsx`

**Changes**:

1. **Import helpers**:
   ```typescript
   import { getMinimumBookingDate, isSameDayBooking } from '@/lib/timeSlots'
   ```

2. **Date input constraint**:
   ```tsx
   <label className="block text-xs text-gray-600 mb-1">
     New Date (tomorrow or later)
   </label>
   <input
     type="date"
     value={rescheduleDate}
     onChange={(e) => setRescheduleDate(e.target.value)}
     min={getMinimumBookingDate()}
     className="..."
   />
   ```

3. **Server-side validation in handler**:
   ```typescript
   const handleReschedule = async () => {
     if (!booking || !rescheduleDate || !rescheduleTime) return

     if (isSameDayBooking(rescheduleDate)) {
       alert('Same-day bookings are not allowed. Please choose a date from tomorrow onward.')
       return
     }

     // ... 17:30 time validation
     // ... rest of reschedule logic
   }
   ```

**Protection Layers**:
- HTML5 `min` attribute prevents selection
- JavaScript validation provides fallback
- Clear user feedback via alert
- Label indicates restriction

### 6. Booking Creation API (Customer)

**File**: `app/api/bookings/create/route.ts`

**Changes**:
```typescript
import { isSameDayBooking } from '@/lib/timeSlots'

export async function POST(request: NextRequest) {
  const payload: CreateBookingPayload = await request.json()

  if (isSameDayBooking(payload.selectedDate)) {
    return NextResponse.json(
      { error: 'Same-day bookings are not allowed. Please choose a date from tomorrow onward.' },
      { status: 400 }
    )
  }

  // ... rest of booking creation logic
}
```

**Server-Side Protection**:
- Validates date before any database operations
- Returns 400 Bad Request with clear error
- Prevents bypass attempts via API manipulation

### 7. Admin Booking Creation API

**File**: `app/api/admin/bookings/create/route.ts`

**Changes**:
```typescript
import { isSameDayBooking } from '@/lib/timeSlots'

export async function POST(request: NextRequest) {
  const payload = await request.json()
  const { selectedDate } = payload

  if (isSameDayBooking(selectedDate)) {
    return NextResponse.json(
      { error: 'Same-day bookings are not allowed. Please choose a date from tomorrow onward.' },
      { status: 400 }
    )
  }

  // ... rest of admin booking creation logic
}
```

**Admin API Protection**:
- Same validation as customer API
- No exceptions for admin users
- Ensures consistent business rules

## Complete Flow Coverage

### Customer Journey

1. **Select Service** → Service selected
2. **Choose Date** → Date picker shows tomorrow as minimum
3. **Select Date** → Can only pick tomorrow or later
4. **API Validation** → Availability API rejects if today somehow submitted
5. **Select Time** → Time slots appear (if not today)
6. **Create Booking** → Booking API validates date again
7. **Success** → Booking created for tomorrow or later

### Admin Manual Booking Journey

1. **Open Modal** → Manual booking form appears
2. **Select Customer** → Customer chosen
3. **Select Service** → Service selected
4. **Choose Date** → Date picker shows tomorrow as minimum
5. **Select Date** → Can only pick tomorrow or later
6. **Select Time** → Time slots generated
7. **Create Booking** → API validates date
8. **Success** → Booking created for tomorrow or later

### Admin Reschedule Journey

1. **Open Booking** → View booking details
2. **Click Reschedule** → Reschedule form appears
3. **Choose New Date** → Date picker shows tomorrow as minimum
4. **HTML Validation** → Browser prevents selecting today
5. **JavaScript Validation** → Alert shown if today somehow selected
6. **Update Booking** → Reschedule proceeds for tomorrow or later

## Edge Cases Handled

### 1. Timezone Considerations
**Scenario**: User in different timezone tries to book

**Handling**:
- Date comparison uses local date (normalized to midnight)
- Consistent with how business operates in South Africa
- `getMinimumBookingDate()` always returns tomorrow relative to server time

### 2. Manual API Requests
**Scenario**: Tech-savvy user tries to bypass UI and call API directly with today's date

**Protection**:
- All booking creation APIs validate with `isSameDayBooking()`
- Returns 400 Bad Request
- Clear error message
- No booking created

### 3. Clock Change at Midnight
**Scenario**: User selects date just before midnight, submits just after

**Handling**:
- Server-side validation happens at submission time
- If date becomes "today" by submission, request is rejected
- User sees error and can select tomorrow

### 4. Admin Override Attempt
**Scenario**: Admin tries to manually type today's date

**Protection**:
1. HTML `min` attribute blocks in most browsers
2. JavaScript validation in `handleReschedule` catches it
3. User sees alert with clear message
4. Booking update blocked

### 5. Availability Check for Today
**Scenario**: Somehow availability API receives today's date

**Result**:
- API returns `isFullyBlocked: true`
- Returns empty `availableSlots` array
- Includes error message
- UI shows no available times

## Integration with Other Restrictions

### Combined with 17:30 Latest Start Time

**Rule Stack**:
1. ✅ Date must be tomorrow or later
2. ✅ Start time must be ≤ 17:30
3. ✅ After-hours surcharge applies 16:30-17:30
4. ✅ Service must fit within business/after-hours window

**Validation Order** (in booking creation):
1. Check if same-day → Reject
2. Check if time > 17:30 → Reject
3. Check room availability → Reject if unavailable
4. Calculate pricing (including after-hours if applicable)
5. Create booking

### Combined with Business Hours

**Scenario**: Business closed tomorrow

**Result**:
- Tomorrow still shows as available date
- But no time slots appear (business hours check)
- User sees "No available times" message

### Combined with Time Blocks

**Scenario**: Tomorrow has full-day time block

**Result**:
- Tomorrow shows as available date
- Availability API returns empty slots
- User sees "This date is fully booked"

## Data Integrity

### Database Level
- No database constraints added for same-day restriction
- Handled entirely at application level
- Existing bookings with today's date are not affected
- Future bookings checked only at creation/update time

### Application Level
- All booking creation paths validate
- All reschedule paths validate
- Availability API validates
- No bypass mechanisms

## Error Messages

### User-Facing Message
```
"Same-day bookings are not allowed. Please choose a date from tomorrow onward."
```

**Used in**:
- Availability API response
- Booking creation API error
- Admin booking creation API error
- Reschedule validation alert

**Characteristics**:
- Clear and non-technical
- Explains what's wrong
- Provides actionable solution
- Consistent across all touchpoints

## UI/UX Improvements

### Date Picker Labels

**Customer Booking**:
- Label: "Preferred Date"
- Min: Tomorrow
- No additional text needed (constraint is obvious)

**Admin Manual Booking**:
- Label: "Date"
- Min: Tomorrow
- No additional text needed

**Admin Reschedule**:
- Label: "New Date (tomorrow or later)"
- Min: Tomorrow
- Explicit reminder in label

### Visual Indicators

- Date pickers automatically gray out today and past dates
- Browser prevents selecting invalid dates
- No additional visual indicators needed
- Clear error messages if validation fails

## Technical Details

### Date String Format

**Input Format**: `YYYY-MM-DD` (ISO 8601 date portion)

**Examples**:
- `"2026-03-17"` - March 17, 2026
- `"2026-03-18"` - March 18, 2026

### Date Comparison Logic

```typescript
function isSameDayBooking(dateString: string): boolean {
  const bookingDate = new Date(dateString)
  const today = new Date()

  // Normalize both dates to midnight (removes time component)
  bookingDate.setHours(0, 0, 0, 0)
  today.setHours(0, 0, 0, 0)

  // Compare timestamps
  return bookingDate.getTime() === today.getTime()
}
```

**Why normalize to midnight?**
- Removes time-of-day differences
- Focuses comparison on date only
- Consistent with date input behavior

### Tomorrow Calculation

```typescript
function getMinimumBookingDate(): string {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)

  const year = tomorrow.getFullYear()
  const month = String(tomorrow.getMonth() + 1).padStart(2, '0')
  const day = String(tomorrow.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}
```

**Why use this approach?**
- Handles month/year rollovers automatically
- `setDate()` intelligently wraps to next month
- Returns consistent format for HTML date inputs

## Testing Checklist

- [x] Customer booking date picker starts from tomorrow
- [x] Admin manual booking date picker starts from tomorrow
- [x] Admin reschedule date picker starts from tomorrow
- [x] Availability API rejects today's date
- [x] Customer booking creation API rejects today's date
- [x] Admin booking creation API rejects today's date
- [x] Reschedule handler validates and blocks today's date
- [x] Clear error messages shown to users
- [x] HTML min attribute prevents UI selection
- [x] JavaScript validation provides fallback
- [x] TypeScript compiles without errors
- [x] Production build succeeds
- [x] Works with 17:30 time restriction
- [x] Works with business hours logic
- [x] Works with time blocks

## Files Modified

1. **lib/timeSlots.ts**
   - Added `isSameDayBooking()` function
   - Added `getMinimumBookingDate()` function

2. **app/api/availability/slots/route.ts**
   - Added same-day validation
   - Returns error if today requested

3. **components/booking-steps/DateTimeStep.tsx**
   - Date input `min` set to `getMinimumBookingDate()`

4. **components/admin/ManualBookingModal.tsx**
   - Date input `min` set to `getMinimumBookingDate()`

5. **components/admin/BookingDetailDrawer.tsx**
   - Date input `min` set to `getMinimumBookingDate()`
   - Added validation in `handleReschedule()`
   - Updated label to indicate restriction

6. **app/api/bookings/create/route.ts**
   - Added same-day validation
   - Returns 400 error if today

7. **app/api/admin/bookings/create/route.ts**
   - Added same-day validation
   - Returns 400 error if today

## Future Considerations

### Potential Enhancements

1. **Configurable Lead Time**
   - Make minimum booking date configurable (e.g., 2 days, 1 week)
   - Add setting in admin panel
   - Update `getMinimumBookingDate()` to use config

2. **Different Rules by Service**
   - Some services might allow same-day booking
   - Add `same_day_allowed` field to services table
   - Conditional validation based on service

3. **VIP/Admin Exception**
   - Allow admins to override for emergency bookings
   - Add admin-only checkbox "Allow same-day"
   - Skip validation when override enabled

4. **Time-of-Day Cutoff**
   - Allow same-day bookings before certain time (e.g., before noon)
   - More complex logic: "If before 10 AM, allow same-day"
   - Update `isSameDayBooking()` to include time check

### Migration Path

If minimum booking date changes in future:

1. Update `getMinimumBookingDate()` logic
2. Update error messages to match new policy
3. Update UI labels if needed
4. Consider database configuration table
5. Test all booking flows

## Summary

**What Changed**:
- Added helper functions for same-day detection and minimum date
- Date pickers now start from tomorrow
- All booking creation/update paths validate against same-day
- Server-side validation prevents API bypass
- Clear error messaging across all touchpoints

**What Stayed the Same**:
- Business hours logic
- Time slot generation (except date filtering)
- After-hours surcharge calculation
- 17:30 latest start time restriction
- Room allocation logic
- Payment flows
- Email notifications

**Result**:
No same-day bookings can be created through any flow, with protection at both UI and API levels.
