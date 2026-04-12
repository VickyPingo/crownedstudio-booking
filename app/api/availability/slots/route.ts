import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import {
  findAllAvailableSlotsInActiveGroupWithMeta,
  Room,
  RoomBooking,
  SchedulingTimeBlock,
} from '@/lib/controlledScheduling'
import { isActiveBooking } from '@/lib/bookingFilters'

interface AvailabilityRequest {
  date: string
  serviceSlug: string
  serviceDurationMinutes: number
  peopleCount: number
}

// ... (UNCHANGED CODE ABOVE)

// ✅ ADDITION: helper stays the same
function isWeekendInSast(date: string): boolean {
  const day = new Date(`${date}T12:00:00+02:00`).getDay()
  return day === 0 || day === 6
}

// ... (UNCHANGED FUNCTIONS)

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as AvailabilityRequest
    const { date, serviceSlug, serviceDurationMinutes, peopleCount } = body

    if (!date || !serviceDurationMinutes || !peopleCount) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // ✅ NEW: DATE-SPECIFIC SERVICE EXCLUSIONS
    const blockedServiceDates: Record<string, string[]> = {
      'relaxation-renewal': ['2026-05-09', '2026-05-10'],
      'complete-body-care': ['2026-05-09', '2026-05-10'],
      'massage-creative-escape': ['2026-05-09', '2026-05-10'],
      'ultimate-relaxation': ['2026-05-09', '2026-05-10'],
      'massage-facial-bliss': ['2026-05-09', '2026-05-10'],
    }

    if (blockedServiceDates[serviceSlug]?.includes(date)) {
      return NextResponse.json({
        availableSlots: [],
        isFullyBlocked: true,
      })
    }

    const supabase = supabaseAdmin

    if (CROWNED_NIGHT_SLUGS.includes(serviceSlug)) {
      const result = await getEveningAvailability(date, peopleCount, supabase)
      return NextResponse.json(result)
    }

    const { start, end } = getUtcRangeForSastDate(date)

    const { data: roomsData, error: roomsError } = await supabase
      .from('rooms')
      .select('id, room_name, room_area, capacity, priority, active')
      .eq('active', true)
      .eq('room_area', 'treatment')
      .order('priority', { ascending: true })

    if (roomsError) {
      console.error('[Availability] rooms error', roomsError)
      return NextResponse.json({ error: 'Failed to load rooms' }, { status: 500 })
    }

    const allTreatmentRooms = (roomsData || []) as Room[]

    const { data: bookingsData, error: bookingsError } = await supabase
      .from('bookings')
      .select('id, start_time, end_time, room_id, status, payment_expires_at')
      .gte('start_time', start)
      .lte('start_time', end)

    if (bookingsError) {
      console.error('[Availability] bookings error', bookingsError)
      return NextResponse.json({ error: 'Failed to load bookings' }, { status: 500 })
    }

    const activeBookings = ((bookingsData || []) as BookingRow[]).filter((booking) =>
      isActiveBooking(booking.status, booking.payment_expires_at)
    )

    const bookingIds = activeBookings.map((booking) => booking.id)

    let bookingRoomsData: BookingRoomRow[] = []
    if (bookingIds.length > 0) {
      const { data: splitRooms, error: bookingRoomsError } = await supabase
        .from('booking_rooms')
        .select('booking_id, room_id')
        .in('booking_id', bookingIds)

      if (bookingRoomsError) {
        console.error('[Availability] booking_rooms error', bookingRoomsError)
        return NextResponse.json({ error: 'Failed to load booking rooms' }, { status: 500 })
      }

      bookingRoomsData = (splitRooms || []) as BookingRoomRow[]
    }

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
            end_time: booking.end_time,
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
            end_time: booking.end_time,
          })
        }
      }
    }

    const { data: timeBlocksRaw } = await supabase
      .from('time_blocks')
      .select('id, block_date, start_time, end_time, is_full_day, reason, room_id')
      .eq('block_date', date)

    const timeBlocks: SchedulingTimeBlock[] = (timeBlocksRaw || []) as SchedulingTimeBlock[]

    const weekendOverride = isWeekendInSast(date)

    let activeRooms: Room[] = []
    let activeGroupBookings: RoomBooking[] = []
    let activeGroupTimeBlocks: SchedulingTimeBlock[] = []
    let activeGroupLabel: string = 'weekend-all-rooms'

    if (weekendOverride) {
      activeRooms = [...allTreatmentRooms].sort((a, b) => a.priority - b.priority)
      const allRoomIds = new Set(activeRooms.map((room) => room.id))

      activeGroupBookings = roomBookings.filter((booking) => allRoomIds.has(booking.room_id))

      activeGroupTimeBlocks = timeBlocks.filter(
        (block) => !block.room_id || allRoomIds.has(block.room_id)
      )
    } else {
      const slotResult = findAllAvailableSlotsInActiveGroupWithMeta(
        date,
        allTreatmentRooms,
        roomBookings,
        serviceDurationMinutes,
        peopleCount,
        sanitizeHHMM(NORMAL_HOURS_START),
        sanitizeHHMM(NORMAL_HOURS_END),
        timeBlocks
      )

      const activeRoomIdSet = new Set(slotResult.activeRoomIds)

      activeRooms = allTreatmentRooms
        .filter((room) => activeRoomIdSet.has(room.id))
        .sort((a, b) => a.priority - b.priority)

      activeGroupBookings = roomBookings.filter((booking) =>
        activeRoomIdSet.has(booking.room_id)
      )

      activeGroupTimeBlocks = timeBlocks.filter(
        (block) => !block.room_id || activeRoomIdSet.has(block.room_id)
      )

      activeGroupLabel = String(slotResult.activeGroup ?? 'weekday-active-group')
    }

    if (activeRooms.length === 0) {
      return NextResponse.json({
        availableSlots: [],
        isFullyBlocked: true,
      })
    }

    const candidateSlots = buildCandidateSlots(activeGroupBookings, activeGroupTimeBlocks)
    const occupancies = buildRoomOccupancies(
      activeGroupBookings,
      activeGroupTimeBlocks,
      activeRooms.map((r) => r.id)
    )

    const roomToRankedSlots = new Map<string, string[]>()

    for (const room of activeRooms) {
      const validSlots = candidateSlots.filter((slot) =>
        isRoomFreeForSlot(room.id, slot, serviceDurationMinutes, occupancies)
      )

      const rankedSlots = rankSlotsForRoom(room.id, validSlots, occupancies)
      roomToRankedSlots.set(room.id, rankedSlots)
    }

    const availableSlots = pickFinalSlots(activeRooms, roomToRankedSlots)

    return NextResponse.json({
      availableSlots,
      isFullyBlocked: availableSlots.length === 0,
    })
  } catch (error) {
    console.error('[Availability] unexpected error', error)
    return NextResponse.json({ error: 'Failed to calculate availability' }, { status: 500 })
  }
}
