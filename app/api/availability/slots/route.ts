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

interface RoomOccupancy {
  room_id: string
  startMin: number
  endMin: number
  source: 'booking' | 'time_block'
}

const NORMAL_HOURS_START = '08:30'
const NORMAL_HOURS_END = '17:30'
const EVENING_START_TIME = '17:30'
const EVENING_MAX_BOOKINGS = 2
const EVENING_MAX_PEOPLE = 4
const CROWNED_NIGHT_SLUGS = ['crowned-night-a', 'crowned-night-b']
const HHMM_RE = /^\d{2}:\d{2}$/
const BOOKING_BUFFER_MINUTES = 10

const MORNING_END = 11 * 60 // 11:00
const MID_MORNING_END = 14 * 60 // 14:00
const DAY_END = 17 * 60 + 30 // 17:30

function timeHHMMToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

function minutesToHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function getUtcRangeForSastDate(date: string) {
  return {
    start: new Date(`${date}T00:00:00+02:00`).toISOString(),
    end: new Date(`${date}T23:59:59.999+02:00`).toISOString(),
  }
}

function getMinutesFromIsoInSast(isoString: string): number {
  const ms = new Date(isoString).getTime()
  const sastMs = ms + 2 * 60 * 60 * 1000
  return Math.floor(sastMs / 60000) % (24 * 60)
}

function getBucket(slot: string): 'morning' | 'midMorning' | 'afternoon' | null {
  const min = timeHHMMToMinutes(slot)
  if (min >= timeHHMMToMinutes(NORMAL_HOURS_START) && min < MORNING_END) return 'morning'
  if (min >= MORNING_END && min < MID_MORNING_END) return 'midMorning'
  if (min >= MID_MORNING_END && min < DAY_END) return 'afternoon'
  return null
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd
}

function sanitizeHHMM(value: string): string {
  if (!value) return ''
  const [h = '00', m = '00'] = value.split(':')
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`
}

function isWeekendInSast(date: string): boolean {
  const day = new Date(`${date}T12:00:00+02:00`).getDay()
  return day === 0 || day === 6
}

function buildCandidateSlots(
  roomBookings: RoomBooking[],
  timeBlocks: SchedulingTimeBlock[]
): string[] {
  const candidates = new Set<string>()

  // Base half-hour grid
  for (
    let min = timeHHMMToMinutes(NORMAL_HOURS_START);
    min <= timeHHMMToMinutes(NORMAL_HOURS_END);
    min += 30
  ) {
    candidates.add(minutesToHHMM(min))
  }

  // Booking end + cleanup buffer
  for (const booking of roomBookings) {
    const endMin = getMinutesFromIsoInSast(booking.end_time) + BOOKING_BUFFER_MINUTES
    if (
      endMin >= timeHHMMToMinutes(NORMAL_HOURS_START) &&
      endMin <= timeHHMMToMinutes(NORMAL_HOURS_END)
    ) {
      candidates.add(minutesToHHMM(endMin))
    }
  }

  // Time block end (no extra buffer)
  for (const block of timeBlocks) {
    if (block.is_full_day || !block.end_time) continue
    const endMin = timeHHMMToMinutes(block.end_time.slice(0, 5))
    if (
      endMin >= timeHHMMToMinutes(NORMAL_HOURS_START) &&
      endMin <= timeHHMMToMinutes(NORMAL_HOURS_END)
    ) {
      candidates.add(minutesToHHMM(endMin))
    }
  }

  return Array.from(candidates)
    .filter((slot) => HHMM_RE.test(slot))
    .sort((a, b) => timeHHMMToMinutes(a) - timeHHMMToMinutes(b))
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

function buildRoomOccupancies(
  roomBookings: RoomBooking[],
  timeBlocks: SchedulingTimeBlock[],
  activeRoomIds: string[]
): RoomOccupancy[] {
  const occupancies: RoomOccupancy[] = []

  for (const booking of roomBookings) {
    occupancies.push({
      room_id: booking.room_id,
      startMin: getMinutesFromIsoInSast(booking.start_time),
      endMin: getMinutesFromIsoInSast(booking.end_time) + BOOKING_BUFFER_MINUTES,
      source: 'booking',
    })
  }

  for (const block of timeBlocks) {
    const targetRoomIds = block.room_id ? [block.room_id] : activeRoomIds

    for (const roomId of targetRoomIds) {
      if (block.is_full_day) {
        occupancies.push({
          room_id: roomId,
          startMin: 0,
          endMin: 24 * 60,
          source: 'time_block',
        })
        continue
      }

      if (!block.start_time || !block.end_time) continue

      occupancies.push({
        room_id: roomId,
        startMin: timeHHMMToMinutes(block.start_time.slice(0, 5)),
        endMin: timeHHMMToMinutes(block.end_time.slice(0, 5)),
        source: 'time_block',
      })
    }
  }

  return occupancies
}

function isRoomFreeForSlot(
  roomId: string,
  slot: string,
  serviceDurationMinutes: number,
  occupancies: RoomOccupancy[]
): boolean {
  const startMin = timeHHMMToMinutes(slot)
  const endMin = startMin + serviceDurationMinutes + BOOKING_BUFFER_MINUTES

  if (endMin > timeHHMMToMinutes(NORMAL_HOURS_END)) {
    return false
  }

  const roomOccs = occupancies.filter((o) => o.room_id === roomId)

  for (const occ of roomOccs) {
    if (overlaps(startMin, endMin, occ.startMin, occ.endMin)) {
      return false
    }
  }

  return true
}

function rankSlotsForRoom(
  roomId: string,
  validSlots: string[],
  occupancies: RoomOccupancy[]
): string[] {
  const roomOccs = occupancies
    .filter((o) => o.room_id === roomId)
    .sort((a, b) => a.startMin - b.startMin)

  if (roomOccs.length === 0) {
    return [...validSlots].sort((a, b) => timeHHMMToMinutes(a) - timeHHMMToMinutes(b))
  }

  return [...validSlots].sort((a, b) => {
    const aMin = timeHHMMToMinutes(a)
    const bMin = timeHHMMToMinutes(b)

    const aGaps = roomOccs
      .map((o) => aMin - o.endMin)
      .filter((gap) => gap >= 0)
      .sort((x, y) => x - y)

    const bGaps = roomOccs
      .map((o) => bMin - o.endMin)
      .filter((gap) => gap >= 0)
      .sort((x, y) => x - y)

    const aHasPostBookingGap = aGaps.length > 0
    const bHasPostBookingGap = bGaps.length > 0

    if (aHasPostBookingGap && !bHasPostBookingGap) return -1
    if (!aHasPostBookingGap && bHasPostBookingGap) return 1

    if (aHasPostBookingGap && bHasPostBookingGap) {
      const aGap = aGaps[0]
      const bGap = bGaps[0]
      if (aGap !== bGap) return aGap - bGap
      return aMin - bMin
    }

    return aMin - bMin
  })
}

function pickFinalSlots(
  activeRooms: Room[],
  roomToRankedSlots: Map<string, string[]>
): string[] {
  const selected: string[] = []
  const used = new Set<string>()

  // STEP 1: first unique slot per room, in priority order
  for (const room of activeRooms) {
    const ranked = roomToRankedSlots.get(room.id) || []
    const firstUnique = ranked.find((slot) => !used.has(slot))
    if (firstUnique) {
      selected.push(firstUnique)
      used.add(firstUnique)
    }
    if (selected.length >= 3) break
  }

  // STEP 2: try to ensure coverage across buckets, but ONLY within these same active rooms
  if (selected.length < 3) {
    const existingBuckets = new Set(
      selected
        .map(getBucket)
        .filter((bucket): bucket is 'morning' | 'midMorning' | 'afternoon' => bucket !== null)
    )

    const desiredBuckets: Array<'morning' | 'midMorning' | 'afternoon'> = [
      'morning',
      'midMorning',
      'afternoon',
    ]

    for (const bucket of desiredBuckets) {
      if (selected.length >= 3) break
      if (existingBuckets.has(bucket)) continue

      let picked: string | null = null

      for (const room of activeRooms) {
        const ranked = roomToRankedSlots.get(room.id) || []
        const match = ranked.find((slot) => !used.has(slot) && getBucket(slot) === bucket)
        if (match) {
          picked = match
          break
        }
      }

      if (picked) {
        selected.push(picked)
        used.add(picked)
        existingBuckets.add(bucket)
      }
    }
  }

  // STEP 3: still under 3? keep filling ONLY from the same active rooms
  if (selected.length < 3) {
    for (const room of activeRooms) {
      const ranked = roomToRankedSlots.get(room.id) || []
      for (const slot of ranked) {
        if (selected.length >= 3) break
        if (used.has(slot)) continue
        selected.push(slot)
        used.add(slot)
      }
      if (selected.length >= 3) break
    }
  }

  return selected.slice(0, 3)
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as AvailabilityRequest
    const { date, serviceSlug, serviceDurationMinutes, peopleCount } = body

    if (!date || !serviceDurationMinutes || !peopleCount) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
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
    let activeGroupLabel = 'weekend-all-rooms'

    if (weekendOverride) {
      activeRooms = [...allTreatmentRooms].sort((a, b) => a.priority - b.priority)
      const allRoomIds = new Set(activeRooms.map((room) => room.id))

      activeGroupBookings = roomBookings.filter((booking) => allRoomIds.has(booking.room_id))

      activeGroupTimeBlocks = timeBlocks.filter(
        (block) => !block.room_id || allRoomIds.has(block.room_id)
      )
    } else {
      // Weekdays keep the existing strict first-active-group rule
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

      activeGroupLabel = slotResult.activeGroup
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

      console.log('[Availability][ActiveGroupRoom]', {
        room: room.room_name,
        priority: room.priority,
        validSlots,
        rankedSlots,
      })
    }

    const availableSlots = pickFinalSlots(activeRooms, roomToRankedSlots)

    console.log(
      '[Availability] ACTIVE GROUP',
      activeGroupLabel,
      activeRooms.map((room) => room.id)
    )
    console.log('[Availability] FINAL selected slots', availableSlots)
    console.log('[Availability] selected date/service/people', {
      date,
      serviceSlug,
      serviceDurationMinutes,
      peopleCount,
    })

    return NextResponse.json({
      availableSlots,
      isFullyBlocked: availableSlots.length === 0,
    })
  } catch (error) {
    console.error('[Availability] unexpected error', error)
    return NextResponse.json({ error: 'Failed to calculate availability' }, { status: 500 })
  }
}
