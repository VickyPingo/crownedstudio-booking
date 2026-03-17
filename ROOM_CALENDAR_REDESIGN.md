# Room Calendar Redesign

## Overview
Redesigned the Room Calendar to use 10-minute increments internally while maintaining visual clarity with 30-minute major gridlines.

## Key Changes

### 1. Precision Timing System
- **Internal grid**: 10-minute increments for precise positioning
- **Visual grid**: 30-minute major lines with 10-minute minor lines
- **Slot height**: 60px per 30-minute slot (2px per minute)

### 2. Absolute Positioning
Replaced the old CSS Grid layout with absolute positioning:

```typescript
const getBookingPosition = (booking: RoomBooking): { top: number; height: number } => {
  const startTime = new Date(booking.start_time)
  const endTime = new Date(booking.end_time)

  const startMinutes = getMinutesFromCalendarStart(startTime)
  const durationMinutes = (endTime.getTime() - startTime.getTime()) / 60000

  const top = (startMinutes / 30) * SLOT_HEIGHT_PX
  const height = (durationMinutes / 30) * SLOT_HEIGHT_PX

  return { top, height }
}
```

### 3. Layout Structure
- **Left column**: Time labels with 30-minute major gridlines
- **Room columns**: Fixed columns that never shift
- **Minor gridlines**: 10-minute intervals for visual reference
- **Booking cards**: Absolutely positioned based on exact start time and duration

### 4. Visual Hierarchy
- **Major gridlines**: Bold borders every 30 minutes with time labels
- **Minor gridlines**: Subtle borders every 10 minutes
- **Booking cards**: Positioned precisely between gridlines

## How It Works

### Example: Booking at 10:10 AM
- Start time: 10:10 AM
- Minutes from calendar start (8:00 AM): 130 minutes
- Position: `(130 / 30) * 60px = 260px` from top
- Appears correctly between 10:00 and 10:30 gridlines

### Example: 80-minute booking
- Duration: 80 minutes
- Height: `(80 / 30) * 60px = 160px`
- Spans across 2.67 half-hour slots visually

## Benefits

1. **Accurate positioning**: Bookings appear at their exact start time
2. **Fixed columns**: Room assignments are stable and never shift
3. **Visual clarity**: Major gridlines every 30 minutes keep the UI clean
4. **Precise duration**: Card height reflects exact booking duration
5. **10-minute accuracy**: Supports the booking system's 10-minute increments

## Technical Details

- Calendar range: 8:00 AM - 8:00 PM
- Slot height: 60px per 30 minutes
- Minor gridlines: Every 10 minutes (20px intervals)
- Major gridlines: Every 30 minutes (60px intervals)
- Booking z-index: 10 (above gridlines)
