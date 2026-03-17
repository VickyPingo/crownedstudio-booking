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
  payment_expires_at?: string | null
}

interface BookingRoom {
  booking_id: string
  room_id: string
  bookings: {
    id: string
    start_time: string
    end_time: string
    status: string
    payment_expires_at?: string | null
  }
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

function findRoomCombination(
  availableRooms: Room[],
  peopleCount: number
): Room[] | null {
  if (peopleCount <= 3) {
    const singleRoom = availableRooms.find(r => r.capacity >= peopleCount)
    return singleRoom ? [singleRoom] : null
  }

  const preferredRoomNames = ['Room 1', 'Room 3', 'Room 4']
  const preferredRooms = availableRooms.filter(r => preferredRoomNames.includes(r.room_name))
  const otherRooms = availableRooms.filter(r => !preferredRoomNames.includes(r.room_name))

  function tryFindCombination(rooms: Room[], needed: number, selected: Room[] = []): Room[] | null {
    if (needed <= 0) return selected

    for (let i = 0; i < rooms.length; i++) {
      const room = rooms[i]
      if (selected.includes(room)) continue

      const newSelected = [...selected, room]
      const totalCapacity = newSelected.reduce((sum, r) => sum + r.capacity, 0)

      if (totalCapacity >= peopleCount) {
        return newSelected
      }

      const remainingRooms = rooms.slice(i + 1)
      const result = tryFindCombination(remainingRooms, peopleCount - totalCapacity, newSelected)
      if (result) return result
    }

    return null
  }

  let combination = tryFindCombination(preferredRooms, peopleCount)
  if (combination) return combination

  combination = tryFindCombination([...preferredRooms, ...otherRooms], peopleCount)
  return combination
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
      .select('id, room_name, room_area, capacity, priority')
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
    const bufferMs = CLEANUP_BUFFER_MINUTES * 60000

    const availableSlots: string[] = []

    for (const slot of allPossibleSlots) {
      const slotStartMs = new Date(`${date}T${slot}:00+02:00`).getTime()
      const slotEndMs = slotStartMs + serviceDurationMinutes * 60000

      const occupiedRoomIds = new Set<string>()

      for (const booking of activeLegacyBookings) {
        const bookingStart = new Date(booking.start_time).getTime()
        const bookingEnd = new Date(booking.end_time).getTime()
        const bookingEndWithBuffer = bookingEnd + bufferMs

        if (slotStartMs < bookingEndWithBuffer && slotEndMs > bookingStart) {
          if (booking.room_id) {
            occupiedRoomIds.add(booking.room_id)
          }
        }
      }

      for (const br of activeBookingRooms) {
        const booking = (br as any).bookings
        const bookingStart = new Date(booking.start_time).getTime()
        const bookingEnd = new Date(booking.end_time).getTime()
        const bookingEndWithBuffer = bookingEnd + bufferMs

        if (slotStartMs < bookingEndWithBuffer && slotEndMs > bookingStart) {
          occupiedRoomIds.add(br.room_id)
        }
      }

      const availableRooms = allRooms.filter(room => !occupiedRoomIds.has(room.id))

      const roomCombination = findRoomCombination(availableRooms, peopleCount || 1)

      if (peopleCount >= 4 && allPossibleSlots.indexOf(slot) < 3) {
        console.log(`[Availability] Slot ${slot}:`, {
          occupiedRooms: Array.from(occupiedRoomIds),
          availableRooms: availableRooms.map(r => ({ name: r.room_name, capacity: r.capacity })),
          roomCombination: roomCombination?.map(r => r.room_name),
          isAvailable: !!roomCombination
        })
      }

      if (roomCombination && roomCombination.length > 0) {
        availableSlots.push(slot)
      }
    }

    console.log('[Availability] Result:', { totalSlots: availableSlots.length, firstFew: availableSlots.slice(0, 3) })

    return NextResponse.json({
      availableSlots,
      isFullyBlocked: false,
    })
  } catch (error) {
    console.error('Availability check error:', error)
    return NextResponse.json({ error: 'Failed to check availability' }, { status: 500 })
  }
}
