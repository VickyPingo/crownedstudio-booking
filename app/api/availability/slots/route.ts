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

    const supabase = supabaseAdmin
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
