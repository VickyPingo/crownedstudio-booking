import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import {
  findAllAvailableSlotsInActiveGroupWithMeta,
  Room,
  RoomBooking,
  SchedulingTimeBlock
} from '@/lib/controlledScheduling'
import { isActiveBooking } from '@/lib/bookingFilters'

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
  people_count?: number
  service_slug?: string
}

interface BookingRoomRow {
  booking_id: string
  room_id: string
}

const NORMAL_HOURS_START = '08:30'
const NORMAL_HOURS_END = '17:30'
const EVENING_START_TIME = '17:30'
const EVENING_MAX_BOOKINGS = 2
const EVENING_MAX_PEOPLE = 4
const CROWNED_NIGHT_SLUGS = ['crowned-night-a', 'crowned-night-b']
const HHMM_RE = /^\d{2}:\d{2}$/

function timeHHMMToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

function getBookingEndWithBufferMinutes(booking: RoomBooking): number {
  const endMs = new Date(booking.end_time).getTime()
  const endMinutes = Math.floor(endMs / 60000) % (24 * 60)
  return endMinutes + 10
}

/**
 * DOWNWARD-FILL scoring.
 *
 * Rule:
 * - If the active group already has bookings, strongly prefer the earliest slot
 *   at or after the latest booking end + buffer in that SAME group.
 * - Earlier “backfill” slots are deliberately penalized.
 * - If the active group has no bookings, prefer the earliest slots.
 */
function scoreSlot(slot: string, activeGroupBookings: RoomBooking[]): number {
  const slotMin = timeHHMMToMinutes(slot)

  if (activeGroupBookings.length === 0) {
    return 100000 - slotMin
  }

  const latestEndWithBuffer = Math.max(
    ...activeGroupBookings.map(getBookingEndWithBufferMinutes)
  )

  const delta = slotMin - latestEndWithBuffer

  if (delta >= 0) {
    // Earliest valid slot after the active group's current tail wins
    return 100000 - delta
  }

  // Strongly de-prioritize going backwards earlier in the day
  return -100000 - Math.abs(delta)
}

function selectBestSlots(
  allValidSlots: string[],
  roomBookings: any[],
  rooms: any[]
): string[] {
  console.log('[SlotRanking] START FIXED LOGIC')

  // STEP 1: sort rooms by priority (lowest = highest priority)
  const sortedRooms = [...rooms].sort((a, b) => a.priority - b.priority)

  console.log('[SlotRanking] Sorted rooms:', sortedRooms.map(r => ({
    name: r.room_name,
    priority: r.priority
  })))

  const selectedSlots: string[] = []

  // STEP 2: loop per room (NOT per time)
  for (const room of sortedRooms) {
    console.log(`[SlotRanking] Checking room ${room.room_name}`)

    for (const slot of allValidSlots) {
      const slotStart = new Date(slot)

      // check if room is free at this slot
      const isBlocked = roomBookings.some(b => {
        if (b.room_id !== room.id) return false

        const start = new Date(b.start_time)
        const end = new Date(b.end_time)

        return slotStart >= start && slotStart < end
      })

      if (!isBlocked) {
        console.log(`[SlotRanking] FOUND slot for ${room.room_name}:`, slot)

        selectedSlots.push(slot)
        break // IMPORTANT → only FIRST slot per room
      }
    }

    if (selectedSlots.length === 3) break
  }

  console.log('[SlotRanking] FINAL:', selectedSlots)

  return selectedSlots
}
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

async function getEveningAvailability(
  date: string,
  peopleCount: number,
  supabase: typeof supabaseAdmin
): Promise<{ availableSlots: string[]; isFullyBlocked: boolean }> {
  const { start, end } = getUtcRangeForSastDate(date)

  const { data: eveningBookingsData, error } = await supabase
    .from('bookings')
    .select('id, start_time, end_time, room_id, status, payment_expires_at, people_count, service_slug')
    .gte('start_time', start)
    .lte('start_time', end)
    .in('service_slug', CROWNED_NIGHT_SLUGS)

  if (error) {
    console.error('[Availability] evening bookings error', error)
    return { availableSlots: [], isFullyBlocked: true }
  }

  const activeEveningBookings = ((eveningBookingsData || []) as BookingRow[]).filter((b) =>
    isActiveBooking(b.status, b.payment_expires_at)
  )

  const existingBookingCount = activeEveningBookings.length
  const existingPeopleCount = activeEveningBookings.reduce(
    (sum, b) => sum + (b.people_count || 0),
    0
  )

  const bookingsAfter = existingBookingCount + 1
  const peopleAfter = existingPeopleCount + peopleCount

  if (
    existingBookingCount >= EVENING_MAX_BOOKINGS ||
    existingPeopleCount >= EVENING_MAX_PEOPLE ||
    bookingsAfter > EVENING_MAX_BOOKINGS ||
    peopleAfter > EVENING_MAX_PEOPLE
  ) {
    return { availableSlots: [], isFullyBlocked: true }
  }

  return { availableSlots: [EVENING_START_TIME], isFullyBlocked: false }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as AvailabilityRequest
    const { date, serviceSlug, serviceDurationMinutes, peopleCount } = body

    if (!date || !serviceDurationMinutes || !peopleCount) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const supabase = supabaseAdmin

    if (CROWNED_NIGHT_SLUGS.includes(serviceSlug)) {
      const result = await getEveningAvailability(date, peopleCount, supabase)
      console.log('[Availability] EVENING SLOTS', result.availableSlots)
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
      return NextResponse.json(
        { error: 'Failed to load rooms' },
        { status: 500 }
      )
    }

    const rooms = (roomsData || []) as Room[]

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

    const { data: timeBlocksRaw } = await supabase
      .from('time_blocks')
      .select('id, block_date, start_time, end_time, is_full_day, reason, room_id')
      .eq('block_date', date)

    const timeBlocks: SchedulingTimeBlock[] = (timeBlocksRaw || []) as SchedulingTimeBlock[]

    if (timeBlocks.length > 0) {
      console.log('[Availability] Passing', timeBlocks.length, 'time block(s) into slot scheduler for date', date)
    }

    const slotResult = findAllAvailableSlotsInActiveGroupWithMeta(
      date,
      rooms,
      roomBookings,
      serviceDurationMinutes,
      peopleCount,
      sanitizeHHMM(NORMAL_HOURS_START),
      sanitizeHHMM(NORMAL_HOURS_END),
      timeBlocks
    )

    console.log('[Availability] RAW SLOTS (after group+time-block scheduling)', slotResult.slots)
    console.log('[Availability] ACTIVE GROUP', slotResult.activeGroup, 'ROOM IDS', slotResult.activeRoomIds)

    const allValidSlots = slotResult.slots.filter(
      (slot) => typeof slot === 'string' && HHMM_RE.test(slot)
    )

    const activeRoomIdSet = new Set(slotResult.activeRoomIds)
    const activeGroupBookings =
      activeRoomIdSet.size > 0
        ? roomBookings.filter((booking) => activeRoomIdSet.has(booking.room_id))
        : roomBookings

const availableSlots = selectBestSlots(
  allValidSlots,
  activeGroupBookings,
  activeRooms // <-- IMPORTANT (you already have this)
)

console.log(
  `[Availability] FINAL SLOTS (${availableSlots.length} of ${allValidSlots.length} valid)`,
  availableSlots
)

console.log('[Availability] raw slot result', slotResult)
console.log('[Availability] roomBookings', roomBookings)
console.log('[Availability] selected date/service/people', {
  date,
  serviceSlug,
  serviceDurationMinutes,
  peopleCount
})

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
