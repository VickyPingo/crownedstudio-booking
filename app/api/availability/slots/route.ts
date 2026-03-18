import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import {
  findAllAvailableSlotsInActiveGroup,
  Room,
  RoomBooking
} from '@/lib/controlledScheduling'

interface AvailabilityRequest {
  date: string
  serviceSlug: string
  serviceDurationMinutes: number
  peopleCount: number
}

interface BookingRow {
  id: string
  start_time: string
  end_time: string
  room_id: string | null
  status: string
  payment_expires_at?: string | null
}

interface BookingRoomRow {
  booking_id: string
  room_id: string
}

const NORMAL_HOURS_START = '08:30'
const NORMAL_HOURS_END = '17:30'
const HHMM_RE = /^\d{2}:\d{2}$/

function sanitizeHHMM(value: string): string {
  if (!value) return ''
  const [h = '00', m = '00'] = value.split(':')
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`
}

function getUtcRangeForSastDate(date: string) {
  return {
    start: new Date(`${date}T00:00:00+02:00`).toISOString(),
    end: new Date(`${date}T23:59:59.999+02:00`).toISOString()
  }
}

function isActiveBooking(status: string, paymentExpiresAt?: string | null) {
  if (status === 'pending_payment') {
    if (!paymentExpiresAt) return true
    return new Date(paymentExpiresAt).getTime() > Date.now()
  }

  return status === 'confirmed' || status === 'completed'
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as AvailabilityRequest
    const { date, serviceDurationMinutes, peopleCount } = body

    if (!date || !serviceDurationMinutes || !peopleCount) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const supabase = supabaseAdmin()
    const { start, end } = getUtcRangeForSastDate(date)

    // 1. Load treatment rooms in priority order
    const { data: roomsData, error: roomsError } = await supabase
      .from('rooms')
      .select('id, room_name, room_area, capacity, priority, active')
      .eq('active', true)
      .eq('room_area', 'treatment')
      .order('priority', { ascending: true })

    if (roomsError) {
      console.error('[Availability] rooms error', roomsError)
      return NextResponse.json(
        { error: 'Failed to load rooms' },
        { status: 500 }
      )
    }

    const rooms = (roomsData || []) as Room[]

    // 2. Load bookings for the selected day
    const { data: bookingsData, error: bookingsError } = await supabase
      .from('bookings')
      .select('id, start_time, end_time, room_id, status, payment_expires_at')
      .gte('start_time', start)
      .lte('start_time', end)

    if (bookingsError) {
      console.error('[Availability] bookings error', bookingsError)
      return NextResponse.json(
        { error: 'Failed to load bookings' },
        { status: 500 }
      )
    }

    const activeBookings = ((bookingsData || []) as BookingRow[]).filter((booking) =>
      isActiveBooking(booking.status, booking.payment_expires_at)
    )

    const bookingIds = activeBookings.map((booking) => booking.id)

    // 3. Load split-room assignments
    let bookingRoomsData: BookingRoomRow[] = []
    if (bookingIds.length > 0) {
      const { data: splitRooms, error: bookingRoomsError } = await supabase
        .from('booking_rooms')
        .select('booking_id, room_id')
        .in('booking_id', bookingIds)

      if (bookingRoomsError) {
        console.error('[Availability] booking_rooms error', bookingRoomsError)
        return NextResponse.json(
          { error: 'Failed to load booking rooms' },
          { status: 500 }
        )
      }

      bookingRoomsData = (splitRooms || []) as BookingRoomRow[]
    }

    // 4. Build a flat room booking list from BOTH legacy room_id and booking_rooms
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

      const extraRooms = bookingRoomsData.filter((row) => row.booking_id === booking.id)
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

    // 5. Controlled scheduling
    const rawSlots = findAllAvailableSlotsInActiveGroup(
      date,
      rooms,
      roomBookings,
      serviceDurationMinutes,
      peopleCount,
      sanitizeHHMM(NORMAL_HOURS_START),
      sanitizeHHMM(NORMAL_HOURS_END)
    )

    console.log('[Availability] RAW SLOTS', rawSlots)

    // 6. Final safety filter
    const availableSlots = rawSlots.filter(
      (slot) => typeof slot === 'string' && HHMM_RE.test(slot)
    )

    console.log('[Availability] FINAL SLOTS', availableSlots)

    return NextResponse.json({
      availableSlots,
      isFullyBlocked: availableSlots.length === 0
    })
  } catch (error) {
    console.error('[Availability] unexpected error', error)
    return NextResponse.json(
      { error: 'Failed to calculate availability' },
      { status: 500 }
    )
  }
}


export async function POST(request: NextRequest) {
  try {
    const body: AvailabilityRequest = await request.json()
    const { date, serviceSlug, serviceDurationMinutes, peopleCount } = body

    console.log('[Availability] Request:', { date, serviceSlug, serviceDurationMinutes, peopleCount })

    if (!date || !serviceSlug || !serviceDurationMinutes) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (isSameDayBooking(date)) {
      return NextResponse.json({
        availableSlots: [],
        isFullyBlocked: true,
        error: 'Same-day bookings are not allowed. Please choose a date from tomorrow onward.'
      })
    }

    const supabase = supabaseAdmin

    const { data: service } = await supabase
      .from('services')
      .select('service_area')
      .eq('slug', serviceSlug)
      .maybeSingle()

    const serviceArea = service?.service_area || 'treatment'

    const { data: allRooms } = await supabase
      .from('rooms')
      .select('id, room_name, room_area, capacity, priority, active')
      .eq('active', true)
      .eq('room_area', serviceArea)
      .order('priority', { ascending: true })

    console.log('[Availability] All rooms:', allRooms?.map(r => ({ name: r.room_name, capacity: r.capacity, priority: r.priority })))

    if (!allRooms || allRooms.length === 0) {
      console.log('[Availability] No rooms found for service area:', serviceArea)
      return NextResponse.json({ availableSlots: [], isFullyBlocked: true })
    }

    const dayStart = new Date(`${date}T00:00:00+02:00`)
    const dayEnd = new Date(`${date}T23:59:59+02:00`)

    const now = new Date().toISOString()
    const { data: legacyBookings } = await supabase
      .from('bookings')
      .select('id, start_time, end_time, room_id, status, payment_expires_at')
      .in('status', ['confirmed', 'pending_payment'])
      .gte('start_time', dayStart.toISOString())
      .lte('start_time', dayEnd.toISOString())
      .not('room_id', 'is', null)

    const { data: bookingRooms } = await supabase
      .from('booking_rooms')
      .select('booking_id, room_id, bookings!inner(id, start_time, end_time, status, payment_expires_at)')
      .gte('bookings.start_time', dayStart.toISOString())
      .lte('bookings.start_time', dayEnd.toISOString())
      .in('bookings.status', ['confirmed', 'pending_payment'])

    const activeLegacyBookings = (legacyBookings || []).filter(booking => {
      if (booking.status === 'confirmed') return true
      if (booking.status === 'pending_payment') {
        return !booking.payment_expires_at || booking.payment_expires_at > now
      }
      return false
    })

    const activeBookingRooms = (bookingRooms || []).filter(br => {
      const booking = (br as any).bookings
      if (booking.status === 'confirmed') return true
      if (booking.status === 'pending_payment') {
        return !booking.payment_expires_at || booking.payment_expires_at > now
      }
      return false
    })

    const { data: timeBlocksData } = await supabase
      .from('time_blocks')
      .select('id, block_date, start_time, end_time, is_full_day, reason')
      .eq('block_date', date)

    const timeBlocks: TimeBlock[] = timeBlocksData || []

    if (isDateFullyBlocked(timeBlocks)) {
      return NextResponse.json({ availableSlots: [], isFullyBlocked: true })
    }

    const parsedDate = new Date(date)
    const dayOfWeek = parsedDate.getDay()

    const { data: businessHoursData } = await supabase
      .from('business_hours')
      .select('open_time, close_time, after_hours_enabled, after_hours_end_time')
      .eq('day_of_week', dayOfWeek)
      .maybeSingle()

    if (!businessHoursData) {
      return NextResponse.json({ availableSlots: [], isFullyBlocked: true })
    }

    const { data: serviceTimeWindowData } = await supabase
      .from('service_time_windows')
      .select('service_slug, start_time, end_time')
      .eq('service_slug', serviceSlug)
      .maybeSingle()

    const config: TimeSlotConfig = {
      serviceSlug,
      serviceDurationMinutes,
      businessHours: businessHoursData,
      serviceTimeWindow: serviceTimeWindowData || null,
      timeBlocks,
    }

    const allPossibleSlots = generateTimeSlots(config)

    const allBookings: { start_time: string; end_time: string; room_id: string }[] = []

    for (const booking of activeLegacyBookings) {
      if (booking.room_id) {
        allBookings.push({
          start_time: booking.start_time,
          end_time: booking.end_time,
          room_id: booking.room_id
        })
      }
    }

    for (const br of activeBookingRooms) {
      const booking = (br as any).bookings
      allBookings.push({
        start_time: booking.start_time,
        end_time: booking.end_time,
        room_id: br.room_id
      })
    }

    const toHHMM = (t: string) => t ? t.slice(0, 5) : t
    const businessStartTime = toHHMM(businessHoursData.open_time) || '08:00'
    const businessEndTime = toHHMM(
      businessHoursData.after_hours_enabled
        ? (businessHoursData.after_hours_end_time || businessHoursData.close_time)
        : businessHoursData.close_time
    )

    const result = findAllAvailableSlotsInActiveGroup(
      date,
      serviceDurationMinutes,
      peopleCount || 1,
      allRooms,
      allBookings,
      businessStartTime,
      businessEndTime
    )

    if (!result) {
      console.log('[Availability] No available slots found')
      return NextResponse.json({
        availableSlots: [],
        isFullyBlocked: false,
      })
    }

    console.log('[Availability] Found slots in Group', result.groupNumber, ':', result.slots.length, 'slots')

    const safeSlots = result.slots.filter(
      (slot) => typeof slot === 'string' && /^\d{2}:\d{2}$/.test(slot)
    )

    return NextResponse.json({
      availableSlots: safeSlots,
      isFullyBlocked: false,
    })
  } catch (error) {
    console.error('Availability check error:', error)
    return NextResponse.json({ error: 'Failed to check availability' }, { status: 500 })
  }
}
