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

  const dayStart = new Date(startTime)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(startTime)
  dayEnd.setHours(23, 59, 59, 999)

  let bookingsQuery = supabase
    .from('bookings')
    .select('id, start_time, end_time, room_id, status, payment_expires_at')
    .in('status', ['confirmed', 'pending_payment'])
    .gte('start_time', dayStart.toISOString())
    .lte('start_time', dayEnd.toISOString())
    .not('room_id', 'is', null)

  if (excludeBookingId) {
    bookingsQuery = bookingsQuery.neq('id', excludeBookingId)
  }

  const { data: legacyBookings } = await bookingsQuery

  const { data: bookingRooms } = await supabase
    .from('booking_rooms')
    .select('booking_id, room_id, bookings!inner(id, start_time, end_time, status, payment_expires_at)')
    .gte('bookings.start_time', dayStart.toISOString())
    .lte('bookings.start_time', dayEnd.toISOString())
    .in('bookings.status', ['confirmed', 'pending_payment'])

  const now = new Date().toISOString()
  const occupiedRoomIds = new Set<string>()

  if (legacyBookings) {
    for (const booking of legacyBookings) {
      if (excludeBookingId && booking.id === excludeBookingId) continue

      let isActive = false
      if (booking.status === 'confirmed') isActive = true
      if (booking.status === 'pending_payment') {
        isActive = !booking.payment_expires_at || booking.payment_expires_at > now
      }

      if (isActive && booking.room_id) {
        const bookingStart = new Date(booking.start_time)
        const bookingEnd = new Date(booking.end_time)
        if (doTimesOverlapWithBuffer(startTime, endTime, bookingStart, bookingEnd)) {
          occupiedRoomIds.add(booking.room_id)
        }
      }
    }
  }

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
          occupiedRoomIds.add(br.room_id)
        }
      }
    }
  }

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

export async function assignRoomToBooking(
  bookingId: string,
  roomId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = supabaseAdmin

  const { error } = await supabase
    .from('bookings')
    .update({ room_id: roomId })
    .eq('id', bookingId)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}

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

  if (roomIds.length > 0) {
    await supabase
      .from('bookings')
      .update({ room_id: roomIds[0] })
      .eq('id', bookingId)
  }

  return { success: true }
}

export async function checkRoomAvailability(
  roomId: string,
  startTime: Date,
  endTime: Date,
  excludeBookingId?: string
): Promise<boolean> {
  const supabase = supabaseAdmin

  const dayStart = new Date(startTime)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(startTime)
  dayEnd.setHours(23, 59, 59, 999)

  let query = supabase
    .from('bookings')
    .select('id, start_time, end_time, status, payment_expires_at')
    .eq('room_id', roomId)
    .in('status', ['confirmed', 'pending_payment'])
    .gte('start_time', dayStart.toISOString())
    .lte('start_time', dayEnd.toISOString())

  if (excludeBookingId) {
    query = query.neq('id', excludeBookingId)
  }

  const { data: legacyBookings } = await query

  let bookingRoomsQuery = supabase
    .from('booking_rooms')
    .select('booking_id, bookings!inner(id, start_time, end_time, status, payment_expires_at)')
    .eq('room_id', roomId)
    .gte('bookings.start_time', dayStart.toISOString())
    .lte('bookings.start_time', dayEnd.toISOString())
    .in('bookings.status', ['confirmed', 'pending_payment'])

  if (excludeBookingId) {
    bookingRoomsQuery = bookingRoomsQuery.neq('booking_id', excludeBookingId)
  }

  const { data: bookingRooms } = await bookingRoomsQuery

  const now = new Date().toISOString()
  const allConflicts: { start_time: string; end_time: string }[] = []

  if (legacyBookings) {
    for (const booking of legacyBookings) {
      let isActive = false
      if (booking.status === 'confirmed') isActive = true
      if (booking.status === 'pending_payment') {
        isActive = !booking.payment_expires_at || booking.payment_expires_at > now
      }

      if (isActive) {
        allConflicts.push({
          start_time: booking.start_time,
          end_time: booking.end_time,
        })
      }
    }
  }

  if (bookingRooms) {
    for (const br of bookingRooms) {
      const booking = (br as any).bookings
      let isActive = false
      if (booking.status === 'confirmed') isActive = true
      if (booking.status === 'pending_payment') {
        isActive = !booking.payment_expires_at || booking.payment_expires_at > now
      }

      if (isActive) {
        allConflicts.push({
          start_time: booking.start_time,
          end_time: booking.end_time,
        })
      }
    }
  }

  const hasConflict = allConflicts.some(conflict => {
    const bookingStart = new Date(conflict.start_time)
    const bookingEnd = new Date(conflict.end_time)
    return doTimesOverlapWithBuffer(startTime, endTime, bookingStart, bookingEnd)
  })

  return !hasConflict
}
