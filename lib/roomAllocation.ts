import { supabaseAdmin } from '@/lib/supabase/server'

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

function doTimesOverlap(
  start1: Date,
  end1: Date,
  start2: Date,
  end2: Date
): boolean {
  return start1 < end2 && end1 > start2
}

export async function allocateRoom(
  serviceRoomArea: string,
  startTime: Date,
  endTime: Date,
  peopleCount: number,
  excludeBookingId?: string
): Promise<RoomAllocationResult> {
  const supabase = supabaseAdmin

  console.log('[RoomAllocation] Starting allocation:', {
    serviceRoomArea,
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
    peopleCount,
    excludeBookingId,
  })

  const { data: rooms, error: roomsError } = await supabase
    .from('rooms')
    .select('*')
    .eq('active', true)
    .eq('room_area', serviceRoomArea)
    .gte('capacity', peopleCount)
    .order('priority', { ascending: true })

  if (roomsError) {
    console.error('[RoomAllocation] Room query error:', roomsError)
    return { room_id: null, room_name: null, error: `Room query failed: ${roomsError.message}` }
  }

  console.log('[RoomAllocation] Found rooms:', rooms?.map(r => ({ id: r.id, name: r.room_name, area: r.room_area, capacity: r.capacity })))

  if (!rooms || rooms.length === 0) {
    console.error('[RoomAllocation] No rooms found for:', { serviceRoomArea, peopleCount })
    return { room_id: null, room_name: null, error: `No rooms available for area "${serviceRoomArea}" with capacity >= ${peopleCount}` }
  }

  const dayStart = new Date(startTime)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(startTime)
  dayEnd.setHours(23, 59, 59, 999)

  let bookingsQuery = supabase
    .from('bookings')
    .select('id, start_time, end_time, room_id, status, people_count')
    .in('status', ['confirmed', 'pending_payment'])
    .gte('start_time', dayStart.toISOString())
    .lte('start_time', dayEnd.toISOString())
    .not('room_id', 'is', null)

  if (excludeBookingId) {
    bookingsQuery = bookingsQuery.neq('id', excludeBookingId)
  }

  const { data: existingBookings } = await bookingsQuery

  const now = new Date().toISOString()
  const activeBookings = (existingBookings || []).filter(booking => {
    if (booking.status === 'confirmed') return true
    if (booking.status === 'pending_payment') {
      return true
    }
    return false
  })

  for (const room of rooms) {
    const roomBookings = activeBookings.filter(b => b.room_id === room.id)

    const hasConflict = roomBookings.some(booking => {
      const bookingStart = new Date(booking.start_time)
      const bookingEnd = new Date(booking.end_time)
      return doTimesOverlap(startTime, endTime, bookingStart, bookingEnd)
    })

    console.log(`[RoomAllocation] Room ${room.room_name}: ${roomBookings.length} bookings, hasConflict=${hasConflict}`)

    if (!hasConflict) {
      console.log(`[RoomAllocation] Allocated room: ${room.room_name} (${room.id})`)
      return { room_id: room.id, room_name: room.room_name }
    }
  }

  console.error('[RoomAllocation] All rooms occupied for this time slot')
  return { room_id: null, room_name: null, error: 'All rooms are occupied for this time' }
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
    .in('status', ['confirmed', 'pending_payment', 'completed'])
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

export async function checkRoomAvailability(
  roomId: string,
  startTime: Date,
  endTime: Date,
  excludeBookingId?: string
): Promise<boolean> {
  const supabase = supabaseAdmin

  let query = supabase
    .from('bookings')
    .select('id')
    .eq('room_id', roomId)
    .in('status', ['confirmed', 'pending_payment'])
    .lt('start_time', endTime.toISOString())
    .gt('end_time', startTime.toISOString())

  if (excludeBookingId) {
    query = query.neq('id', excludeBookingId)
  }

  const { data: conflicts } = await query

  return !conflicts || conflicts.length === 0
}
