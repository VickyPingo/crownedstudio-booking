import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { generateTimeSlots, isDateFullyBlocked, isSameDayBooking, TimeSlotConfig, TimeBlock } from '@/lib/timeSlots'
import { CLEANUP_BUFFER_MINUTES } from '@/lib/roomAllocation'

interface AvailabilityRequest {
  date: string
  serviceSlug: string
  serviceDurationMinutes: number
  peopleCount: number
}

interface RoomBooking {
  id: string
  start_time: string
  end_time: string
  room_id: string
  status: string
}

interface Room {
  id: string
  room_name: string
  room_area: string
  capacity: number
  priority: number
}

function checkSlotAvailableInRoom(
  slotStartMs: number,
  slotEndMs: number,
  roomBookings: RoomBooking[],
  bufferMs: number
): boolean {
  for (const booking of roomBookings) {
    const bookingStart = new Date(booking.start_time).getTime()
    const bookingEnd = new Date(booking.end_time).getTime()
    const bookingEndWithBuffer = bookingEnd + bufferMs

    if (slotStartMs < bookingEndWithBuffer && slotEndMs > bookingStart) {
      return false
    }
  }
  return true
}

export async function POST(request: NextRequest) {
  try {
    const body: AvailabilityRequest = await request.json()
    const { date, serviceSlug, serviceDurationMinutes, peopleCount } = body

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

    const { data: rooms } = await supabase
      .from('rooms')
      .select('id, room_name, room_area, capacity, priority')
      .eq('active', true)
      .eq('room_area', serviceArea)
      .gte('capacity', peopleCount || 1)
      .order('priority', { ascending: true })

    if (!rooms || rooms.length === 0) {
      return NextResponse.json({ availableSlots: [], isFullyBlocked: true })
    }

    const preferredRooms = rooms.filter(r => r.priority <= 2)
    if (preferredRooms.length === 0) {
      preferredRooms.push(rooms[0])
    }

    const dayStart = new Date(`${date}T00:00:00+02:00`)
    const dayEnd = new Date(`${date}T23:59:59+02:00`)

    const now = new Date().toISOString()
    const { data: existingBookings } = await supabase
      .from('bookings')
      .select('id, start_time, end_time, room_id, status, payment_expires_at')
      .in('status', ['confirmed', 'pending_payment'])
      .gte('start_time', dayStart.toISOString())
      .lte('start_time', dayEnd.toISOString())
      .not('room_id', 'is', null)

    const activeBookings = (existingBookings || []).filter(booking => {
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
    const bufferMs = CLEANUP_BUFFER_MINUTES * 60000

    const preferredRoomIds = new Set(preferredRooms.map(r => r.id))
    const preferredRoomBookings = activeBookings.filter(
      (b) => preferredRoomIds.has(b.room_id)
    )

    const bookingsByRoom = new Map<string, RoomBooking[]>()
    for (const room of preferredRooms) {
      bookingsByRoom.set(room.id, preferredRoomBookings.filter(b => b.room_id === room.id))
    }

    const availableSlots: string[] = []

    for (const slot of allPossibleSlots) {
      const slotStartMs = new Date(`${date}T${slot}:00+02:00`).getTime()
      const slotEndMs = slotStartMs + serviceDurationMinutes * 60000

      let isAvailableInAnyPreferredRoom = false
      for (const room of preferredRooms) {
        const roomBookings = bookingsByRoom.get(room.id) || []
        if (checkSlotAvailableInRoom(slotStartMs, slotEndMs, roomBookings, bufferMs)) {
          isAvailableInAnyPreferredRoom = true
          break
        }
      }

      if (isAvailableInAnyPreferredRoom) {
        availableSlots.push(slot)
      }
    }

    return NextResponse.json({
      availableSlots,
      isFullyBlocked: false,
    })
  } catch (error) {
    console.error('Availability check error:', error)
    return NextResponse.json({ error: 'Failed to check availability' }, { status: 500 })
  }
}
