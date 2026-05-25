import { supabaseAdmin } from '@/lib/supabase/server'
import { groupRoomsByPriority, findRoomCombinationInGroup } from './controlledScheduling'
import type { TimeBlock } from './timeSlots'

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

/**
 * Services that get Room 7 as first preference (≤2 people).
 * If Room 7 is occupied, they fall back to standard rooms.
 * If >2 people, they skip Room 7 entirely and use standard rooms.
 * All other services never see Room 7.
 */
const ROOM7_PREFERRED_SLUGS = new Set([
  'cosy-comfort',            // WP2
  'head-to-toe',             // WP3
  'complete-body-care',      // SC2
  'massage-creative-escape', // SC3
])

/**
 * Determines whether a booking should block room availability.
 * - confirmed → always blocks
 * - completed → always blocks (handled at query level, not needed here)
 * - pending_payment with null expiry → does NOT block (admin bookings set confirmed directly; a null expiry on pending is a data anomaly)
 * - pending_payment with future expiry → blocks
 * - pending_payment with past expiry → does NOT block (treat as expired even if cleanup hasn't run)
 * - expired / cancelled / cancelled_expired → never blocks
 */
function isBlockingStatus(
  status: string,
  paymentExpiresAt: string | null | undefined,
  now: string
): boolean {
  if (status === 'confirmed' || status === 'completed') return true
  if (status === 'pending_payment') {
    if (!paymentExpiresAt) {
      return false
    }
    return paymentExpiresAt > now
  }
  return false
}

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
 * Strict time block overlap — NO buffer.
 * requestedStart < blockEnd && requestedEnd > blockStart
 * A booking starting exactly when a block ends is NOT blocked.
 */
function doesOverlapTimeBlock(
  requestedStart: Date,
  requestedEnd: Date,
  blockStart: Date,
  blockEnd: Date
): boolean {
  return requestedStart < blockEnd && requestedEnd > blockStart
}

/**
 * Loads time blocks for a given date and returns only those that
 * affect the requested time window.
 *
 * - global blocks (room_id IS NULL): affect all rooms
 * - room-specific blocks (room_id IS NOT NULL): affect only that room
 *
 * Returns a tuple of [globalBlocks, roomSpecificBlocks]
 */
async function loadTimeBlocksForWindow(
  startTime: Date,
  endTime: Date
): Promise<{ globalBlocks: TimeBlock[]; roomBlocks: Map<string, TimeBlock[]> }> {
  const supabase = supabaseAdmin
  const SAST_OFFSET_MS = 2 * 60 * 60 * 1000
  const sastStartMs = startTime.getTime() + SAST_OFFSET_MS
  const dateStr = new Date(sastStartMs).toISOString().slice(0, 10)

  const { data: rawBlocks, error } = await supabase
    .from('time_blocks')
    .select('id, block_date, start_time, end_time, is_full_day, reason, room_id')
    .eq('block_date', dateStr)

  if (error || !rawBlocks) {
    console.error('[RoomAllocation] Failed to load time_blocks:', error)
    return { globalBlocks: [], roomBlocks: new Map() }
  }

  const globalBlocks: TimeBlock[] = []
  const roomBlocks = new Map<string, TimeBlock[]>()

  for (const tb of rawBlocks as TimeBlock[]) {
    if (tb.is_full_day) {
      if (!tb.room_id) {
        globalBlocks.push(tb)
      } else {
        const list = roomBlocks.get(tb.room_id) || []
        list.push(tb)
        roomBlocks.set(tb.room_id, list)
      }
      continue
    }

    if (!tb.start_time || !tb.end_time) continue

    const blockStart = new Date(`${dateStr}T${tb.start_time.slice(0, 5)}:00+02:00`)
    const blockEnd = new Date(`${dateStr}T${tb.end_time.slice(0, 5)}:00+02:00`)

    console.log(
      `[RoomAllocation][TimeBlock] Overlap check` +
      ` | bookingStart=${startTime.toISOString()} bookingEnd=${endTime.toISOString()}` +
      ` | blockStart=${blockStart.toISOString()} blockEnd=${blockEnd.toISOString()}` +
      ` | block id=${tb.id} room_id=${tb.room_id ?? 'global'}`
    )

    if (!doesOverlapTimeBlock(startTime, endTime, blockStart, blockEnd)) continue

    if (!tb.room_id) {
      globalBlocks.push(tb)
    } else {
      const list = roomBlocks.get(tb.room_id) || []
      list.push(tb)
      roomBlocks.set(tb.room_id, list)
    }
  }

  return { globalBlocks, roomBlocks }
}

/**
 * Returns a blocking TimeBlock if the given room is blocked during the requested window,
 * or null if the room is free. Checks both global blocks (affect all rooms) and
 * room-specific blocks.
 */
export async function getBlockingTimeBlock(
  roomId: string,
  startTime: Date,
  endTime: Date
): Promise<TimeBlock | null> {
  const { globalBlocks, roomBlocks } = await loadTimeBlocksForWindow(startTime, endTime)

  if (globalBlocks.length > 0) {
    const block = globalBlocks[0]
    console.log(
      `[RoomAllocation][TimeBlock] Room ${roomId} blocked by GLOBAL time block id=${block.id}` +
      ` start=${block.start_time || 'full-day'} end=${block.end_time || 'full-day'}` +
      ` reason=${block.reason || 'none'}` +
      ` | requested ${startTime.toISOString()} – ${endTime.toISOString()}`
    )
    return block
  }

  const blocks = roomBlocks.get(roomId)
  if (blocks && blocks.length > 0) {
    const block = blocks[0]
    console.log(
      `[RoomAllocation][TimeBlock] Room ${roomId} blocked by ROOM-SPECIFIC time block id=${block.id}` +
      ` start=${block.start_time || 'full-day'} end=${block.end_time || 'full-day'}` +
      ` reason=${block.reason || 'none'}` +
      ` | requested ${startTime.toISOString()} – ${endTime.toISOString()}`
    )
    return block
  }

  return null
}

/**
 * Returns the set of room IDs that are occupied during the given time window.
 *
 * SOURCE OF TRUTH: booking_rooms is always the authoritative assignment.
 * bookings.room_id is the legacy column — it is only consulted when a booking
 * has NO booking_rooms entries at all (pre-migration legacy record).
 * This prevents ghost-blocking from stale room_id values.
 *
 * Also enforces time_blocks: rooms with an active time block are added to
 * the occupied set without any buffer.
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
      const isActive = isBlockingStatus(booking.status, booking.payment_expires_at, now)

      if (!isActive) {
        console.log(`[RoomAllocation] Ignoring expired/stale pending_payment booking ${booking.id} from room blocking`)
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

      const isActive = isBlockingStatus(booking.status, booking.payment_expires_at, now)

      if (!isActive) {
        console.log(`[RoomAllocation] Ignoring expired/stale pending_payment booking ${booking.id} (legacy) from room blocking`)
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

  // Enforce time blocks — no buffer applied (strict interval overlap)
  const { globalBlocks, roomBlocks } = await loadTimeBlocksForWindow(startTime, endTime)

  if (globalBlocks.length > 0) {
    // A global block means ALL rooms are occupied — load all active room IDs and mark them
    const { data: allRooms } = await supabase
      .from('rooms')
      .select('id')
      .eq('active', true)

    if (allRooms) {
      for (const room of allRooms) {
        console.log(
          `[RoomAllocation][TimeBlock] Room ${room.id} marked occupied by GLOBAL block` +
          ` id=${globalBlocks[0].id} reason=${globalBlocks[0].reason || 'none'}`
        )
        occupied.add(room.id)
      }
    }
  } else {
    for (const [roomId, blocks] of roomBlocks.entries()) {
      if (blocks.length > 0) {
        console.log(
          `[RoomAllocation][TimeBlock] Room ${roomId} marked occupied by ROOM-SPECIFIC block` +
          ` id=${blocks[0].id} reason=${blocks[0].reason || 'none'}`
        )
        occupied.add(roomId)
      }
    }
  }

  return occupied
}

/**
 * Returns available rooms for a given area and time window, filtered by:
 * 1. Rooms with no entries in room_allowed_services → available to all services
 * 2. Rooms with entries in room_allowed_services → only available if serviceSlug matches
 *
 * Also returns the set of restricted room IDs (Room 7) so callers can
 * apply preference logic without re-querying.
 */
async function getAvailableRooms(
  serviceRoomArea: string,
  startTime: Date,
  endTime: Date,
  excludeBookingId?: string,
  serviceSlug?: string
): Promise<{ rooms: Room[]; restrictedRoomIds: Set<string> }> {
  const supabase = supabaseAdmin

  const { data: rooms, error: roomsError } = await supabase
    .from('rooms')
    .select('*')
    .eq('active', true)
    .eq('room_area', serviceRoomArea)
    .order('priority', { ascending: true })

  if (roomsError || !rooms) {
    console.error('[RoomAllocation] Room query error:', roomsError)
    return { rooms: [], restrictedRoomIds: new Set() }
  }

  // Fetch service restrictions for all rooms in this area
  const roomIds = rooms.map((r: any) => r.id)
  const { data: restrictions } = await supabase
    .from('room_allowed_services')
    .select('room_id, service_slug')
    .in('room_id', roomIds)

  // Build map: room_id → Set<allowed_slug>  (only populated for restricted rooms)
  const restrictionMap = new Map<string, Set<string>>()
  for (const row of restrictions || []) {
    if (!restrictionMap.has(row.room_id)) restrictionMap.set(row.room_id, new Set())
    restrictionMap.get(row.room_id)!.add(row.service_slug)
  }

  // Rooms that have ANY restriction entry (i.e. Room 7)
  const restrictedRoomIds = new Set(restrictionMap.keys())

  // Eligibility filter: unrestricted rooms pass always; restricted rooms only if slug matches
  const eligibleRooms = rooms.filter((room: any) => {
    const allowed = restrictionMap.get(room.id)
    if (!allowed || allowed.size === 0) return true        // no restriction → open to all
    if (!serviceSlug) return false                          // restricted room, no slug → exclude
    return allowed.has(serviceSlug)                        // restricted room → slug must match
  })

  const occupiedRoomIds = await getOccupiedRoomIds(startTime, endTime, excludeBookingId)
  const availableRooms = eligibleRooms.filter((room: any) => !occupiedRoomIds.has(room.id))

  return { rooms: availableRooms, restrictedRoomIds }
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

/**
 * Runs the standard group-based room combination logic on a given list of rooms
 * and returns the allocation result. Extracted so it can be called from multiple
 * paths in allocateRoom without duplication.
 */
function allocateFromRoomList(
  rooms: Room[],
  peopleCount: number,
  serviceRoomArea: string
): MultiRoomAllocationResult {
  if (rooms.length === 0) {
    console.error('[RoomAllocation] No available rooms for:', { serviceRoomArea, peopleCount })
    return {
      room_ids: [],
      room_names: [],
      error: `No rooms available for area "${serviceRoomArea}"`,
    }
  }

  const combination = findRoomCombination(rooms, peopleCount)

  if (!combination) {
    console.error('[RoomAllocation] No room combination found for:', { peopleCount, availableRooms: rooms.length })
    return {
      room_ids: [],
      room_names: [],
      error: `No available room combination can accommodate ${peopleCount} people`,
    }
  }

  const invalidRooms = combination.filter(r => r.room_area !== serviceRoomArea)
  if (invalidRooms.length > 0) {
    console.error(
      `[RoomAllocation] DEFENSIVE REJECTION — allocated room(s) [${invalidRooms.map(r => r.room_name).join(', ')}]` +
      ` do not belong to service area "${serviceRoomArea}". This should never happen.`
    )
    return {
      room_ids: [],
      room_names: [],
      error: `Room allocation produced rooms outside the allowed area "${serviceRoomArea}". Please try again.`,
    }
  }

  const room_ids = combination.map(r => r.id)
  const room_names = combination.map(r => r.room_name)

  console.log(`[RoomAllocation] Allocated rooms: ${room_names.join(', ')} (${room_ids.length} rooms) area="${serviceRoomArea}"`)

  return { room_ids, room_names }
}

export async function allocateRoom(
  serviceRoomArea: string,
  startTime: Date,
  endTime: Date,
  peopleCount: number,
  excludeBookingId?: string,
  serviceSlug?: string
): Promise<MultiRoomAllocationResult> {
  console.log('[RoomAllocation] Starting allocation:', {
    serviceRoomArea,
    serviceSlug,
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
    peopleCount,
    excludeBookingId,
  })

  const isPreferredSlug = serviceSlug ? ROOM7_PREFERRED_SLUGS.has(serviceSlug) : false

  const { rooms: availableRooms, restrictedRoomIds } = await getAvailableRooms(
    serviceRoomArea,
    startTime,
    endTime,
    excludeBookingId,
    serviceSlug
  )

  console.log('[RoomAllocation] Available rooms:', availableRooms.map(r => ({
    name: r.room_name,
    capacity: r.capacity,
    priority: r.priority,
    restricted: restrictedRoomIds.has(r.id),
  })))

  // ── PREFERRED SLUGS (WP2, WP3, SC2, SC3) ──────────────────────────────────
  if (isPreferredSlug) {
    if (peopleCount <= 2) {
      // Try Room 7 first (it's in availableRooms only if free + slug matches)
      const room7 = availableRooms.find(r => restrictedRoomIds.has(r.id))
      if (room7) {
        console.log(`[RoomAllocation] Room 7 preference hit: using ${room7.room_name} for "${serviceSlug}"`)
        return { room_ids: [room7.id], room_names: [room7.room_name] }
      }
      // Room 7 occupied — fall back to standard rooms (Rooms 1–6)
      console.log(`[RoomAllocation] Room 7 occupied for "${serviceSlug}", falling back to standard rooms`)
      const standardRooms = availableRooms.filter(r => !restrictedRoomIds.has(r.id))
      return allocateFromRoomList(standardRooms, peopleCount, serviceRoomArea)
    }

    // >2 people — Room 7 can't fit them; use standard rooms only
    console.log(`[RoomAllocation] "${serviceSlug}" with ${peopleCount} people exceeds Room 7 capacity, using standard rooms`)
    const standardRooms = availableRooms.filter(r => !restrictedRoomIds.has(r.id))
    return allocateFromRoomList(standardRooms, peopleCount, serviceRoomArea)
  }

  // ── ALL OTHER SERVICES ────────────────────────────────────────────────────
  // Room 7 is already absent from availableRooms (filtered out by restriction logic)
  return allocateFromRoomList(availableRooms, peopleCount, serviceRoomArea)
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
export interface RoomAssignmentInput {
  roomId: string
  people: number
}

export async function assignRoomsToBooking(
  bookingId: string,
  roomIds: string[],
  assignments?: RoomAssignmentInput[]
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

  const inserts = roomIds.map(roomId => {
    const assignment = assignments?.find(a => a.roomId === roomId)
    return {
      booking_id: bookingId,
      room_id: roomId,
      ...(assignment ? { capacity_used: assignment.people } : {}),
    }
  })

  const { error } = await supabase
    .from('booking_rooms')
    .insert(inserts)

  if (error) {
    return { success: false, error: error.message }
  }

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
