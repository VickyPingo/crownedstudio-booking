import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import {
  generateTimeSlots,
  BOOKING_BUFFER_MINUTES,
  NORMAL_HOURS_START_TIME,
  BusinessHours,
  TimeSlotConfig,
  TimeBlock,
  overlapsBooking,
} from '@/lib/timeSlots'
import {
  findAllAvailableSlotsInActiveGroup,
  findAvailableSlotsAnchoredToRoom,
  Room,
  RoomBooking,
  SchedulingTimeBlock
} from '@/lib/controlledScheduling'
import { filterActiveBookings, ACTIVE_BOOKING_STATUSES } from '@/lib/bookingFilters'

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/**
 * Converts an ISO timestamp to minutes-since-midnight in SAST (UTC+2) timezone.
 * This ensures booking times are compared in the same timezone as the business operates.
 */
function timestampToSASTMinutes(isoTimestamp: string): number {
  const date = new Date(isoTimestamp)
  // Get hours and minutes in UTC+2 (SAST)
  // We need to handle the timezone offset properly
  const utcHours = date.getUTCHours()
  const utcMinutes = date.getUTCMinutes()

  // SAST is UTC+2, so add 2 hours
  const sastHours = (utcHours + 2) % 24

  return sastHours * 60 + utcMinutes
}

export async function POST(request: NextRequest) {
  try {
    const supabase = supabaseAdmin
    const { date, serviceSlug, serviceDurationMinutes, peopleCount, roomId, isCustomBooking } = await request.json()

    if (!date || (!serviceSlug && !isCustomBooking) || !serviceDurationMinutes) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Determine booking mode: single-room vs multi-room
    let useMultiRoomLogic = false
    let requestedRoomName = ''

    if (roomId && peopleCount) {
      const { data: roomRow } = await supabase
        .from('rooms')
        .select('id, room_name, capacity, active')
        .eq('id', roomId)
        .maybeSingle()

      if (!roomRow) {
        console.error(`[AdminAvailability] Room ${roomId} not found`)
        return NextResponse.json({ availableSlots: [] })
      }

      if (!roomRow.active) {
        console.error(`[AdminAvailability] Room ${roomRow.room_name} is not active`)
        return NextResponse.json({ availableSlots: [] })
      }

      requestedRoomName = roomRow.room_name

      // DECISION POINT: Single-room or multi-room?
      if (roomRow.capacity < peopleCount) {
        // peopleCount exceeds single room capacity → switch to multi-room logic
        console.log(
          `[AdminAvailability] Switching to MULTI-ROOM mode: "${roomRow.room_name}" capacity ${roomRow.capacity} < people_count ${peopleCount}`
        )
        useMultiRoomLogic = true
      } else {
        // peopleCount fits in single room → use single-room logic
        console.log(
          `[AdminAvailability] Using SINGLE-ROOM mode for "${roomRow.room_name}" (capacity ${roomRow.capacity}, requested ${peopleCount})`
        )
      }
    }

    const localDate = new Date(date + 'T00:00:00')
    const dayOfWeek = localDate.getDay()

    const { data: hoursRow } = await supabase
      .from('business_hours')
      .select('*')
      .eq('day_of_week', dayOfWeek)
      .maybeSingle()

    const businessHours: BusinessHours = hoursRow
      ? {
          open_time: hoursRow.open_time,
          close_time: hoursRow.close_time,
          after_hours_enabled: hoursRow.after_hours_enabled,
          after_hours_end_time: hoursRow.after_hours_end_time,
        }
      : {
          open_time: NORMAL_HOURS_START_TIME,
          close_time: '17:30',
          after_hours_enabled: false,
          after_hours_end_time: null,
        }

    const { data: timeWindowRow } = serviceSlug
      ? await supabase
          .from('service_time_windows')
          .select('service_slug, days_allowed, start_time, end_time')
          .eq('service_slug', serviceSlug)
          .maybeSingle()
      : { data: null }

    // ✅ DAY-OF-WEEK RESTRICTION (service_time_windows.days_allowed)
    if (timeWindowRow?.days_allowed) {
      const DAY_ABBRS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
      const todayAbbr = DAY_ABBRS[dayOfWeek]
      const allowedDays = (timeWindowRow.days_allowed as string)
        .split(',')
        .map((d: string) => d.trim().toUpperCase())
      if (!allowedDays.includes(todayAbbr)) {
        console.log(`[AdminAvailability] Service "${serviceSlug}" not allowed on ${todayAbbr} — days_allowed: ${timeWindowRow.days_allowed}`)
        return NextResponse.json({ availableSlots: [] })
      }
    }

    const dayStartISO = new Date(date + 'T00:00:00+02:00').toISOString()
    const dayEndISO = new Date(date + 'T23:59:59+02:00').toISOString()

    // ROOM-ANCHORED MULTI-ROOM LOGIC: Anchor room MUST be part of allocation
    if (useMultiRoomLogic && roomId) {
      console.log(`[AdminAvailability] Using ROOM-ANCHORED multi-room logic (anchored to ${requestedRoomName})`)

      // Load all treatment rooms
      const { data: roomsData } = await supabase
        .from('rooms')
        .select('id, room_name, room_area, capacity, priority, active')
        .eq('active', true)
        .eq('room_area', 'treatment')
        .order('priority', { ascending: true })

      const rooms = (roomsData || []) as Room[]

      // Load all bookings for the day
      const { data: bookingsData } = await supabase
        .from('bookings')
        .select('id, start_time, end_time, room_id, status, payment_expires_at')
        .gte('start_time', dayStartISO)
        .lte('start_time', dayEndISO)

      const activeBookings = filterActiveBookings(bookingsData || [])

      const bookingIds = activeBookings.map((b: any) => b.id)

      // Load multi-room assignments
      let bookingRoomsData: any[] = []
      if (bookingIds.length > 0) {
        const { data: splitRooms } = await supabase
          .from('booking_rooms')
          .select('booking_id, room_id')
          .in('booking_id', bookingIds)

        bookingRoomsData = splitRooms || []
      }

      // Build room bookings list (combining legacy room_id and booking_rooms)
      const roomBookings: RoomBooking[] = []
      const seen = new Set<string>()

      for (const booking of activeBookings) {
        if (booking.room_id) {
          const key = `${booking.id}:${booking.room_id}`
          if (!seen.has(key)) {
            seen.add(key)
            roomBookings.push({
              room_id: booking.room_id,
              start_time: booking.start_time,
              end_time: booking.end_time
            })
          }
        }

        const extraRooms = bookingRoomsData.filter((row: any) => row.booking_id === booking.id)
        for (const extraRoom of extraRooms) {
          const key = `${booking.id}:${extraRoom.room_id}`
          if (!seen.has(key)) {
            seen.add(key)
            roomBookings.push({
              room_id: extraRoom.room_id,
              start_time: booking.start_time,
              end_time: booking.end_time
            })
          }
        }
      }

      // Load time blocks
      const { data: timeBlocksRaw } = await supabase
        .from('time_blocks')
        .select('id, block_date, start_time, end_time, is_full_day, reason, room_id')
        .eq('block_date', date)

      const timeBlocks: SchedulingTimeBlock[] = (timeBlocksRaw || []) as SchedulingTimeBlock[]

      // Call ROOM-ANCHORED scheduling logic - anchor room MUST be free
      const availableSlots = findAvailableSlotsAnchoredToRoom(
        date,
        rooms,
        roomId,
        roomBookings,
        serviceDurationMinutes,
        peopleCount,
        businessHours.open_time,
        businessHours.close_time,
        timeBlocks
      )

      console.log(`[AdminAvailability] Room-anchored slots found: ${availableSlots.length}`)
      return NextResponse.json({ availableSlots })
    }

    // SINGLE-ROOM LOGIC: Original behavior
    const { data: timeBlocksRaw } = await supabase
      .from('time_blocks')
      .select('*')
      .eq('block_date', date)

    const timeBlocks: TimeBlock[] = (timeBlocksRaw || []).filter((tb: any) => {
      if (roomId && !useMultiRoomLogic) {
        // Include:
        // 1. Blocks specific to this room (tb.room_id === roomId)
        // 2. Global blocks with no room_id (applies to all rooms, both full-day and partial)
        return tb.room_id === roomId || !tb.room_id
      }
      // When no specific room: include full-day blocks or blocks with no room_id
      return tb.is_full_day || !tb.room_id
    }) as TimeBlock[]

    const config: TimeSlotConfig = {
      serviceSlug: serviceSlug || '__custom__',
      serviceDurationMinutes,
      businessHours,
      serviceTimeWindow: timeWindowRow || null,
      timeBlocks,
    }

    const candidateSlots = generateTimeSlots(config)

    const now = new Date().toISOString()
    const existingBookingTimes: { startMin: number; endMin: number }[] = []

    if (roomId && !useMultiRoomLogic) {
      // SOURCE OF TRUTH: booking_rooms first. Track which booking IDs we've seen.
      const { data: brBookings } = await supabase
        .from('booking_rooms')
        .select('booking_id, bookings!inner(start_time, end_time, status, payment_expires_at)')
        .eq('room_id', roomId)
        .gte('bookings.start_time', dayStartISO)
        .lte('bookings.start_time', dayEndISO)
        .in('bookings.status', ['confirmed', 'completed', 'pending_payment'])

      const seenViaBookingRooms = new Set<string>()

      if (brBookings) {
        for (const br of brBookings) {
          const booking = (br as any).bookings
          if (booking.status === 'pending_payment') {
            if (!booking.payment_expires_at || booking.payment_expires_at <= now) continue
          }
          existingBookingTimes.push({
            startMin: timestampToSASTMinutes(booking.start_time),
            endMin: timestampToSASTMinutes(booking.end_time),
          })
          seenViaBookingRooms.add((br as any).booking_id)
        }
      }

      // Fallback: check bookings.room_id ONLY for legacy-only bookings
      // (those with no booking_rooms entry) to avoid ghost-blocking from stale room_id
      const { data: directBookings } = await supabase
        .from('bookings')
        .select('id, start_time, end_time, status, payment_expires_at')
        .eq('room_id', roomId)
        .in('status', ACTIVE_BOOKING_STATUSES)
        .gte('start_time', dayStartISO)
        .lte('start_time', dayEndISO)

      if (directBookings) {
        for (const b of directBookings) {
          if (seenViaBookingRooms.has(b.id)) continue
          if (b.status === 'pending_payment') {
            if (!b.payment_expires_at || b.payment_expires_at <= now) continue
          }
          existingBookingTimes.push({
            startMin: timestampToSASTMinutes(b.start_time),
            endMin: timestampToSASTMinutes(b.end_time),
          })
        }
      }
    } else if (!roomId) {
      // No specific room — show slots that don't conflict with any booking on this date
      const { data: allBookings } = await supabase
        .from('bookings')
        .select('start_time, end_time, status, payment_expires_at')
        .in('status', ACTIVE_BOOKING_STATUSES)
        .gte('start_time', dayStartISO)
        .lte('start_time', dayEndISO)

      if (allBookings) {
        for (const b of allBookings) {
          if (b.status === 'pending_payment') {
            if (!b.payment_expires_at || b.payment_expires_at <= now) continue
          }
          existingBookingTimes.push({
            startMin: timestampToSASTMinutes(b.start_time),
            endMin: timestampToSASTMinutes(b.end_time),
          })
        }
      }
    }

    const availableSlots = candidateSlots.filter((slot) => {
      const slotStartMin = timeToMinutes(slot)
      const slotEndMin = slotStartMin + serviceDurationMinutes

      for (const booking of existingBookingTimes) {
        if (overlapsBooking(slotStartMin, slotEndMin, booking.startMin, booking.endMin)) {
          console.log(
            `[AdminAvailability] Slot ${slot} rejected — overlaps booking ` +
            `${String(Math.floor(booking.startMin / 60)).padStart(2,'0')}:${String(booking.startMin % 60).padStart(2,'0')}` +
            `-${String(Math.floor(booking.endMin / 60)).padStart(2,'0')}:${String(booking.endMin % 60).padStart(2,'0')}` +
            ` (buffer: ${BOOKING_BUFFER_MINUTES}min applied)`
          )
          return false
        }
      }

      return true
    })

    console.log(`[AdminAvailability] Single-room slots found: ${availableSlots.length}`)
    return NextResponse.json({ availableSlots })
  } catch (error) {
    console.error('[AdminAvailabilitySlots] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
