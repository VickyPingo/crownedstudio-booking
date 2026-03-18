import { supabaseAdmin } from '@/lib/supabase/server'
import { groupRoomsByPriority, findRoomCombinationInGroup } from './controlledScheduling'

export interface Room {
  id: string
  room_name: string
  room_area: string
  capacity: number
  priority: number
  active: boolean
}

export interface BookingTimeSlot {
  id: string
  start_time: string
  end_time: string
  room_id: string | null
  status: string
  people_count: number
}

export interface RoomAllocationResult {
  room_id: string | null
  room_name: string | null
  error?: string
}

export interface MultiRoomAllocationResult {
  room_ids: string[]
  room_names: string[]
  error?: string
}

export const CLEANUP_BUFFER_MINUTES = 10

function doTimesOverlapWithBuffer(
  newStart: Date,
  newEnd: Date,
  existingStart: Date,
  existingEnd: Date
): boolean {
  const existingEndWithBuffer = new Date(existingEnd.getTime() + CLEANUP_BUFFER_MINUTES * 60000)
  return newStart < existingEndWithBuffer && newEnd > existingStart
}

/**
 * Returns the set of room IDs that are occupied during the given time window.
 *
 * SOURCE OF TRUTH: booking_rooms is always the authoritative assignment.
 * bookings.room_id is the legacy column — it is only consulted when a booking
 * has NO booking_rooms entries at all (pre-migration legacy record).
 * This prevents ghost-blocking from stale room_id values.
 */
async function getOccupiedRoomIds(
  startTime: Date,
  endTime: Date,
  excludeBookingId?: string
): Promise<Set<string>> {
  const supabase = supabaseAdmin
  const now = new Date().toISOString()

  const dayStart = new Date(startTime)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(startTime)
  dayEnd.setHours(23, 59, 59, 999)

  const occupied = new Set<string>()

  const { data: bookingRooms } = await supabase
    .from('booking_rooms')
    .select('booking_id, room_id, bookings!inner(id, start_time, end_time, status, payment_expires_at)')
    .gte('bookings.start_time', dayStart.toISOString())
    .lte('bookings.start_time', dayEnd.toISOString())
    .in('bookings.status', ['confirmed', 'pending_payment'])

  const bookingIdsInBookingRooms = new Set<string>()

  if (bookingRooms) {
    for (const br of bookingRooms) {
      if (excludeBookingId && br.booking_id === excludeBookingId) continue

      const booking = (br as any).bookings
      let isActive = false
      if (booking.status === 'confirmed') isActive = true
      if (booking.status === 'pending_payment') {
        isActive = !booking.payment_expires_at || booking.payment_expires_at > now
      }

      if (isActive) {
        const bookingStart = new Date(booking.start_time)
        const bookingEnd = new Date(booking.end_time)
        if (doTimesOverlapWithBuffer(startTime, endTime, bookingStart, bookingEnd)) {
          occupied.add(br.room_id)
        }
        bookingIdsInBookingRooms.add(br.booking_id)
      }
    }
  }

  // Fall back to bookings.room_id ONLY for legacy-only records with no booking_rooms entries
  const { data: legacyOnlyBookings } = await supabase
    .from('bookings')
    .select('id, start_time, end_time, room_id, status, payment_expires_at')
    .in('status', ['confirmed', 'pending_payment'])
    .gte('start_time', dayStart.toISOString())
    .lte('start_time', dayEnd.toISOString())
    .not('room_id', 'is', null)

  if (legacyOnlyBookings) {
    for (const booking of legacyOnlyBookings) {
      if (excludeBookingId && booking.id === excludeBookingId) continue
      if (bookingIdsInBookingRooms.has(booking.id)) continue

      let isActive = false
      if (booking.status === 'confirmed') isActive = true
      if (booking.status === 'pending_payment') {
        isActive = !booking.payment_expires_at || booking.payment_expires_at > now
      }

      if (isActive && booking.room_id) {
        const bookingStart = new Date(booking.start_time)
        const bookingEnd = new Date(booking.end_time)
        if (doTimesOverlapWithBuffer(startTime, endTime, bookingStart, bookingEnd)) {
          occupied.add(booking.room_id)
        }
      }
    }
  }

  return occupied
}

async function getAvailableRooms(
  serviceRoomArea: string,
  startTime: Date,
  endTime: Date,
  excludeBookingId?: string
): Promise<Room[]> {
  const supabase = supabaseAdmin

  const { data: rooms, error: roomsError } = await supabase
    .from('rooms')
    .select('*')
    .eq('active', true)
    .eq('room_area', serviceRoomArea)
    .order('priority', { ascending: true })

  if (roomsError || !rooms) {
    console.error('[RoomAllocation] Room query error:', roomsError)
    return []
  }

  const occupiedRoomIds = await getOccupiedRoomIds(startTime, endTime, excludeBookingId)

  return rooms.filter(room => !occupiedRoomIds.has(room.id))
}

function findRoomCombination(
  availableRooms: Room[],
  peopleCount: number
): Room[] | null {
  const roomGroups = groupRoomsByPriority(availableRooms)

  for (let groupNum = 1; groupNum <= 3; groupNum++) {
    const groupRooms = roomGroups.get(groupNum)
    if (!groupRooms || groupRooms.length === 0) continue

    const combination = findRoomCombinationInGroup(groupRooms, peopleCount)
    if (combination) {
      console.log('[RoomAllocation] Found combination in Group', groupNum, ':', combination.map(r => r.room_name).join(' + '))
      return combination
    }
  }

  console.log('[RoomAllocation] No valid combination found in any group')
  return null
}

export async function allocateRoom(
  serviceRoomArea: string,
  startTime: Date,
  endTime: Date,
  peopleCount: number,
  excludeBookingId?: string
): Promise<MultiRoomAllocationResult> {
  console.log('[RoomAllocation] Starting allocation:', {
    serviceRoomArea,
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
    peopleCount,
    excludeBookingId,
  })

  const availableRooms = await getAvailableRooms(serviceRoomArea, startTime, endTime, excludeBookingId)

  console.log('[RoomAllocation] Available rooms:', availableRooms.map(r => ({
    name: r.room_name,
    capacity: r.capacity,
    priority: r.priority
  })))

  if (availableRooms.length === 0) {
    console.error('[RoomAllocation] No available rooms for:', { serviceRoomArea, peopleCount })
    return {
      room_ids: [],
      room_names: [],
      error: `No rooms available for area "${serviceRoomArea}"`
    }
  }

  const combination = findRoomCombination(availableRooms, peopleCount)

  if (!combination) {
    console.error('[RoomAllocation] No room combination found for:', { peopleCount, availableRooms: availableRooms.length })
    return {
      room_ids: [],
      room_names: [],
      error: `No available room combination can accommodate ${peopleCount} people`
    }
  }

  const room_ids = combination.map(r => r.id)
  const room_names = combination.map(r => r.room_name)

  console.log(`[RoomAllocation] Allocated rooms: ${room_names.join(', ')} (${room_ids.length} rooms)`)

  return { room_ids, room_names }
}

export async function getRoomsForDate(
  date: Date,
  roomArea?: string
): Promise<{ rooms: Room[]; bookings: BookingTimeSlot[] }> {
  const supabase = supabaseAdmin

  const dayStart = new Date(date)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(date)
  dayEnd.setHours(23, 59, 59, 999)

  let roomsQuery = supabase
    .from('rooms')
    .select('*')
    .eq('active', true)
    .order('priority', { ascending: true })

  if (roomArea) {
    roomsQuery = roomsQuery.eq('room_area', roomArea)
  }

  const { data: rooms } = await roomsQuery

  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, start_time, end_time, room_id, status, people_count')
    .in('status', ['confirmed', 'completed'])
    .gte('start_time', dayStart.toISOString())
    .lte('start_time', dayEnd.toISOString())

  return {
    rooms: rooms || [],
    bookings: bookings || []
  }
}

/**
 * Assigns rooms to a booking.
 * Always updates booking_rooms (source of truth) AND syncs bookings.room_id
 * to the first/primary room so the legacy column never drifts out of sync.
 */
export async function assignRoomsToBooking(
  bookingId: string,
  roomIds: string[]
): Promise<{ success: boolean; error?: string }> {
  const supabase = supabaseAdmin

  await supabase
    .from('booking_rooms')
    .delete()
    .eq('booking_id', bookingId)

  if (roomIds.length === 0) {
    await supabase
      .from('bookings')
      .update({ room_id: null })
      .eq('id', bookingId)
    return { success: true }
  }

  const inserts = roomIds.map(roomId => ({
    booking_id: bookingId,
    room_id: roomId,
  }))

  const { error } = await supabase
    .from('booking_rooms')
    .insert(inserts)

  if (error) {
    return { success: false, error: error.message }
  }

  // Always keep bookings.room_id in sync with the primary room from booking_rooms
  // so the legacy column never causes ghost-blocking
  await supabase
    .from('bookings')
    .update({ room_id: roomIds[0] })
    .eq('id', bookingId)

  return { success: true }
}

export async function assignRoomToBooking(
  bookingId: string,
  roomId: string
): Promise<{ success: boolean; error?: string }> {
  return assignRoomsToBooking(bookingId, [roomId])
}

/**
 * Checks whether a specific room is available for the given time window.
 * Uses booking_rooms as source of truth; falls back to room_id only for
 * legacy-only bookings (those with no booking_rooms entries).
 */
export async function checkRoomAvailability(
  roomId: string,
  startTime: Date,
  endTime: Date,
  excludeBookingId?: string
): Promise<boolean> {
  const occupiedRoomIds = await getOccupiedRoomIds(startTime, endTime, excludeBookingId)
  return !occupiedRoomIds.has(roomId)
}
