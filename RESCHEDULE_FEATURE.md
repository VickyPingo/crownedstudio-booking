# Booking Reschedule Feature

## Overview
Complete implementation of booking reschedule tracking with automatic email notifications and audit history.

## Features Implemented

### 1. Database Schema Changes
**Migration File:** `20260317140000_add_reschedule_tracking.sql`

Added to `booking_notes` table:
- `note_type` column (text) - Categories: `general`, `reschedule`, `status_change`, `payment`
- `metadata` column (jsonb) - Stores structured data for reschedule history
- Indexes for efficient filtering by note type

**Metadata Structure for Reschedule Notes:**
```json
{
  "old_start_time": "2024-03-15T08:00:00Z",
  "new_start_time": "2024-03-16T10:00:00Z",
  "old_end_time": "2024-03-15T09:30:00Z",
  "new_end_time": "2024-03-16T11:30:00Z"
}
```

### 2. Email Template
**File:** `lib/email/templates.ts`

- Added `RescheduleEmailData` interface
- Created `bookingRescheduledToClientTemplate()` function
- Template displays:
  - Old appointment date/time (highlighted in amber)
  - New appointment date/time (highlighted prominently)
  - Booking reference
  - Outstanding balance reminder (if applicable)
  - Contact information

**Email Subject:** "Your Crowned Studio Booking Has Been Rescheduled"

### 3. Email Service
**File:** `lib/email/service.ts`

Added `sendBookingRescheduledToClient()` function:
- Sends reschedule notification to customer
- Uses proper timezone conversion (Africa/Johannesburg)
- Includes error handling and logging

### 4. API Endpoint
**File:** `app/api/bookings/send-reschedule-email/route.ts`

Endpoint: `POST /api/bookings/send-reschedule-email`

Request body:
```json
{
  "bookingId": "uuid",
  "oldStartTime": "2024-03-15T08:00:00Z",
  "newStartTime": "2024-03-16T10:00:00Z"
}
```

Features:
- Fetches booking details
- Formats dates with correct timezone
- Sends reschedule email to customer
- Returns success/error response

### 5. Admin Dashboard Integration
**File:** `components/admin/BookingDetailDrawer.tsx`

Enhanced `handleReschedule()` function:
1. Validates reschedule date/time
2. Updates booking start_time and end_time
3. **Creates reschedule note** with:
   - Human-readable description
   - `note_type: 'reschedule'`
   - Metadata with old/new timestamps
   - Current admin user ID
4. **Sends email notification** to customer
5. Refreshes booking display

**Note Format Example:**
```
Booking rescheduled on 17 March 2026 at 14:30.
Previous: Friday, 15 March 2026 at 08:00.
New: Saturday, 16 March 2026 at 10:00.
```

### 6. Visual Display
**File:** `components/admin/BookingDetailDrawer.tsx`

Reschedule notes display with:
- Amber background (bg-amber-50)
- Calendar icon
- "RESCHEDULED" badge
- Formatted date/time with timezone
- Clear visual distinction from general notes

## Timezone Handling

All displayed times use **Africa/Johannesburg (SAST/UTC+2)** timezone:
- Email templates
- Admin dashboard notes
- Customer notifications

Database continues to store times in **UTC** (unchanged).

## Reschedule Flow

### Admin Reschedules Booking:

1. Admin opens booking detail drawer
2. Clicks "Reschedule Booking"
3. Selects new date and time
4. Clicks "Confirm"
5. **System automatically:**
   - Updates booking times in database
   - Creates audit note in booking_notes table
   - Sends email to customer with old/new times
   - Updates calendar and availability
   - Preserves booking reference

### Multiple Reschedules:

- Each reschedule creates a **new note**
- History is preserved (not overwritten)
- Notes are ordered by creation date (newest first)
- All reschedule events are visible in admin dashboard

## Customer Experience

Customer receives email with:
- Clear indication booking was rescheduled
- Side-by-side comparison of old vs new time
- Updated booking details
- Same booking reference (not changed)
- Outstanding balance reminder (if any)
- Contact information for questions

## Database Migration

To apply the migration:

```sql
-- Add note_type column
ALTER TABLE booking_notes ADD COLUMN note_type text DEFAULT 'general' NOT NULL;

-- Add metadata column
ALTER TABLE booking_notes ADD COLUMN metadata jsonb DEFAULT NULL;

-- Add constraint
ALTER TABLE booking_notes
ADD CONSTRAINT valid_note_type
CHECK (note_type IN ('general', 'reschedule', 'status_change', 'payment'));

-- Create indexes
CREATE INDEX idx_booking_notes_note_type ON booking_notes(note_type);
CREATE INDEX idx_booking_notes_booking_note_type ON booking_notes(booking_id, note_type);
```

## Testing Checklist

- [ ] Admin can reschedule booking from detail drawer
- [ ] Reschedule note appears in Internal Notes section
- [ ] Reschedule note has amber styling with calendar icon
- [ ] Customer receives reschedule email with correct times
- [ ] Email times match admin dashboard times (same timezone)
- [ ] Multiple reschedules create separate notes (not overwritten)
- [ ] Booking reference remains unchanged
- [ ] Calendar updates with new time slot
- [ ] Room allocation updates correctly
- [ ] Outstanding balance shows in email (if applicable)

## Error Handling

- Same-day bookings are blocked
- Latest start time is 17:30
- Missing customer email logged but doesn't block reschedule
- Email failures are logged but don't rollback reschedule
- Invalid dates/times show user-friendly alerts

## Future Enhancements

Possible additions:
- Customer-initiated reschedule requests
- Automatic reminder update (reschedule 24h reminder)
- SMS notification for reschedules
- Reschedule reason field
- Admin notes on why reschedule was needed
