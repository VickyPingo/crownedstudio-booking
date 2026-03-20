import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import {
  findAllAvailableSlotsInActiveGroup,
  Room,
  RoomBooking,
  SchedulingTimeBlock
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

const BUCKET_MORNING_START = 8 * 60 + 30   // 08:30
const BUCKET_MID_START     = 11 * 60        // 11:00
const BUCKET_AFT_START     = 14 * 60        // 14:00
const BUCKET_AFT_END       = 17 * 60 + 30  // 17:30

function timeHHMMToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

function getBucket(slot: string): 'morning' | 'midMorning' | 'afternoon' | null {
  const min = timeHHMMToMinutes(slot)
  if (min >= BUCKET_MORNING_START && min < BUCKET_MID_START) return 'morning'
  if (min >= BUCKET_MID_START && min < BUCKET_AFT_START) return 'midMorning'
  if (min >= BUCKET_AFT_START && min < BUCKET_AFT_END) return 'afternoon'
  return null
}

function scoreSlot(slot: string, roomBookings: RoomBooking[]): number {
  const slotMin = timeHHMMToMinutes(slot)

  for (const booking of roomBookings) {
    const endMs = new Date(booking.end_time).getTime()
    const endMinutes = Math.floor(endMs / 60000) % (24 * 60)
    const bufferEnd = endMinutes + 10

    const gap = slotMin - bufferEnd

    if (gap === 0) return 10
    if (gap > 0 && gap <= 10) return 8
    if (gap > 10 && gap <= 20) return -5
    if (gap > 20 && gap <= 30) return -10
  }

  return 5
}

function selectBestSlots(slots: string[], roomBookings: RoomBooking[]): string[] {
  if (slots.length === 0) return []

  interface ScoredSlot { slot: string; score: number }

  const morning: ScoredSlot[] = []
  const midMorning: ScoredSlot[] = []
  const afternoon: ScoredSlot[] = []
  const unassigned: ScoredSlot[] = []

  for (const slot of slots) {
    const scored: ScoredSlot = { slot, score: scoreSlot(slot, roomBookings) }
    const bucket = getBucket(slot)
    if (bucket === 'morning') morning.push(scored)
    else if (bucket === 'midMorning') midMorning.push(scored)
    else if (bucket === 'afternoon') afternoon.push(scored)
    else unassigned.push(scored)
  }

  const best = (arr: ScoredSlot[]): ScoredSlot | null =>
    arr.length === 0 ? null : arr.reduce((a, b) => (b.score > a.score ? b : a))

  const selectedScored: ScoredSlot[] = []
  const used = new Set<string>()

  const bucketBests = [best(morning), best(midMorning), best(afternoon)]
  for (const pick of bucketBests) {
    if (pick && !used.has(pick.slot)) {
      selectedScored.push(pick)
      used.add(pick.slot)
    }
  }

  if (selectedScored.length < 3) {
    const allScored = [...morning, ...midMorning, ...afternoon, ...unassigned]
      .sort((a, b) => b.score - a.score || timeHHMMToMinutes(a.slot) - timeHHMMToMinutes(b.slot))

    for (const s of allScored) {
      if (selectedScored.length >= 3) break
      if (!used.has(s.slot)) {
        selectedScored.push(s)
        used.add(s.slot)
      }
    }
  }

  if (selectedScored.length === 0) return []

  const overallBest = selectedScored.reduce((a, b) => (b.score > a.score ? b : a))
  const rest = selectedScored
    .filter((s) => s.slot !== overallBest.slot)
    .sort((a, b) => timeHHMMToMinutes(a.slot) - timeHHMMToMinutes(b.slot))

  return [overallBest.slot, ...rest.map((s) => s.slot)]
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

function isActiveBooking(status: string, paymentExpiresAt?: string | null): boolean {
  if (status === 'confirmed' || status === 'completed') return true
  if (status === 'pending_payment') {
    if (!paymentExpiresAt) return false
    const isStillActive = new Date(paymentExpiresAt).getTime() > Date.now()
    if (!isStillActive) {
      console.log('[Availability] Ignoring stale pending_payment booking (expired payment window)')
    }
    return isStillActive
  }
  return false
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

    // 5. Load time blocks for this date — passed into scheduling so room-specific
    //    blocks correctly restrict the group that owns those rooms, preventing
    //    spillover into unrelated groups.
    const { data: timeBlocksRaw } = await supabase
      .from('time_blocks')
      .select('id, block_date, start_time, end_time, is_full_day, reason, room_id')
      .eq('block_date', date)

    const timeBlocks: SchedulingTimeBlock[] = (timeBlocksRaw || []) as SchedulingTimeBlock[]

    if (timeBlocks.length > 0) {
      console.log('[Availability] Passing', timeBlocks.length, 'time block(s) into slot scheduler for date', date)
    }

    // 6. Controlled scheduling — time blocks are fed in so room-specific blocks
    //    are treated as room occupancy within their group. No group spillover.
    const rawSlots = findAllAvailableSlotsInActiveGroup(
      date,
      rooms,
      roomBookings,
      serviceDurationMinutes,
      peopleCount,
      sanitizeHHMM(NORMAL_HOURS_START),
      sanitizeHHMM(NORMAL_HOURS_END),
      timeBlocks
    )

    console.log('[Availability] RAW SLOTS (after group+time-block scheduling)', rawSlots)

    // 7. Score and bucket-select best 3 slots spread across the day
    const allValidSlots = rawSlots.filter(
      (slot) => typeof slot === 'string' && HHMM_RE.test(slot)
    )
    const availableSlots = selectBestSlots(allValidSlots, roomBookings)

    console.log(`[Availability] FINAL SLOTS (${availableSlots.length} of ${allValidSlots.length} valid)`, availableSlots)

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
