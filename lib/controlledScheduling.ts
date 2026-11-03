import { ROOM_GROUPS, BOOKING_BUFFER_MINUTES, SLOT_INTERVAL_MINUTES } from './timeSlots'

export interface Room {
  id: string
  room_name: string
  room_area: string
  capacity: number
  priority: number
  active: boolean
}

export interface RoomBooking {
  start_time: string
  end_time: string
  room_id: string
}

export interface SchedulingTimeBlock {
  id: string
  block_date: string
  start_time: string | null
  end_time: string | null
  is_full_day: boolean
  reason: string | null
  room_id?: string | null
}

export interface ActiveGroupAvailabilityResult {
  slots: string[]
  activeGroup: number | null
  activeRoomIds: string[]
}

const HHMM_RE = /^\d{2}:\d{2}$/

function sanitizeHHMM(value: string): string {
  if (!value) return ''
  const [h = '00', m = '00'] = value.split(':')
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`
}

function toUtcMsFromSast(date: string, hhmm: string): number {
  const clean = sanitizeHHMM(hhmm)
  const ms = new Date(`${date}T${clean}:00+02:00`).getTime()
  return Number.isFinite(ms) ? ms : NaN
}

export function msToTimeString(ms: number): string {
  if (!Number.isFinite(ms)) return ''

  const SAST_OFFSET_MS = 2 * 60 * 60 * 1000
  const localMs = ms + SAST_OFFSET_MS
  const totalMinutes = Math.floor(localMs / 60000) % (24 * 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return ''

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd
}

export function getRoomGroup(priority: number): number {
  if (priority >= ROOM_GROUPS.GROUP_1.min && priority <= ROOM_GROUPS.GROUP_1.max) return 1
  if (priority >= ROOM_GROUPS.GROUP_2.min && priority <= ROOM_GROUPS.GROUP_2.max) return 2
  if (priority >= ROOM_GROUPS.GROUP_3.min && priority <= ROOM_GROUPS.GROUP_3.max) return 3
  return 4
}

export function groupRoomsByPriority(rooms: Room[]): Map<number, Room[]> {
  const groups = new Map<number, Room[]>()

  for (const room of rooms) {
    const group = getRoomGroup(room.priority)
    if (!groups.has(group)) {
      groups.set(group, [])
    }
    groups.get(group)!.push(room)
  }

  for (const [group, groupedRooms] of groups.entries()) {
    groups.set(
      group,
      groupedRooms.sort((a, b) => a.priority - b.priority)
    )
  }

  return groups
}

function isRoomFreeAtTime(
  roomId: string,
  bookings: RoomBooking[],
  proposedStartMs: number,
  proposedEndWithBufferMs: number
): boolean {
  const roomBookings = bookings
    .filter((b) => b.room_id === roomId)
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())

  for (const booking of roomBookings) {
    const existingStartMs = new Date(booking.start_time).getTime()
    const existingEndWithBufferMs =
      new Date(booking.end_time).getTime() + BOOKING_BUFFER_MINUTES * 60 * 1000

    if (
      overlaps(
        proposedStartMs,
        proposedEndWithBufferMs,
        existingStartMs,
        existingEndWithBufferMs
      )
    ) {
      return false
    }
  }

  return true
}

function getCandidateStartTimesForGroup(
  date: string,
  groupRooms: Room[],
  bookings: RoomBooking[],
  businessStartTime: string,
  businessEndTime: string
): number[] {
  const candidates = new Set<number>()

  const businessStartMs = toUtcMsFromSast(date, businessStartTime)
  const businessEndMs = toUtcMsFromSast(date, businessEndTime)

  if (!Number.isFinite(businessStartMs) || !Number.isFinite(businessEndMs)) {
    return []
  }

  const intervalMs = SLOT_INTERVAL_MINUTES * 60 * 1000
  for (let t = businessStartMs; t < businessEndMs; t += intervalMs) {
    candidates.add(t)
  }

  const groupRoomIds = new Set(groupRooms.map((room) => room.id))

  for (const booking of bookings) {
    if (!groupRoomIds.has(booking.room_id)) continue

    const bookingEndWithBufferMs =
      new Date(booking.end_time).getTime() + BOOKING_BUFFER_MINUTES * 60 * 1000

    if (
      Number.isFinite(bookingEndWithBufferMs) &&
      bookingEndWithBufferMs >= businessStartMs &&
      bookingEndWithBufferMs < businessEndMs
    ) {
      candidates.add(bookingEndWithBufferMs)
    }
  }

  return Array.from(candidates)
    .filter(Number.isFinite)
    .sort((a, b) => a - b)
}

function calculateValidSlotsForGroup(
  date: string,
  groupRooms: Room[],
  bookings: RoomBooking[],
  serviceDurationMinutes: number,
  peopleCount: number,
  businessStartTime: string,
  businessEndTime: string
): string[] {
  const validSlots: string[] = []

  const businessStartMs = toUtcMsFromSast(date, businessStartTime)
  const businessEndMs = toUtcMsFromSast(date, businessEndTime)

  if (!Number.isFinite(businessStartMs) || !Number.isFinite(businessEndMs)) {
    return []
  }

  const occupancyDurationMs =
    (serviceDurationMinutes + BOOKING_BUFFER_MINUTES) * 60 * 1000

  const candidateStartTimes = getCandidateStartTimesForGroup(
    date,
    groupRooms,
    bookings,
    businessStartTime,
    businessEndTime
  )

  for (const candidateStartMs of candidateStartTimes) {
    if (!Number.isFinite(candidateStartMs)) continue

    const candidateEndWithBufferMs = candidateStartMs + occupancyDurationMs

    if (candidateEndWithBufferMs > businessEndMs) {
      continue
    }

    let availableCapacity = 0

    for (const room of groupRooms) {
      const roomIsFree = isRoomFreeAtTime(
        room.id,
        bookings,
        candidateStartMs,
        candidateEndWithBufferMs
      )

      if (roomIsFree) {
        availableCapacity += room.capacity
      }
    }

    if (availableCapacity >= peopleCount) {
      const slot = msToTimeString(candidateStartMs)
      if (HHMM_RE.test(slot)) {
        validSlots.push(slot)
      }
    }
  }

  return Array.from(new Set(validSlots)).sort()
}

/**
 * ROOM-ANCHORED variant of calculateValidSlotsForGroup.
 *
 * Returns slots where:
 * 1. The anchor room MUST be free
 * 2. Additional rooms in the group can supplement capacity if needed
 * 3. Total capacity >= peopleCount
 *
 * This ensures that when a booking is started from a specific room in the
 * admin calendar, that room participates in the allocation.
 */
function calculateValidSlotsForGroupWithAnchor(
  date: string,
  groupRooms: Room[],
  anchorRoomId: string,
  bookings: RoomBooking[],
  serviceDurationMinutes: number,
  peopleCount: number,
  businessStartTime: string,
  businessEndTime: string
): string[] {
  const validSlots: string[] = []

  const businessStartMs = toUtcMsFromSast(date, businessStartTime)
  const businessEndMs = toUtcMsFromSast(date, businessEndTime)

  if (!Number.isFinite(businessStartMs) || !Number.isFinite(businessEndMs)) {
    return []
  }

  const occupancyDurationMs =
    (serviceDurationMinutes + BOOKING_BUFFER_MINUTES) * 60 * 1000

  const candidateStartTimes = getCandidateStartTimesForGroup(
    date,
    groupRooms,
    bookings,
    businessStartTime,
    businessEndTime
  )

  for (const candidateStartMs of candidateStartTimes) {
    if (!Number.isFinite(candidateStartMs)) continue

    const candidateEndWithBufferMs = candidateStartMs + occupancyDurationMs

    if (candidateEndWithBufferMs > businessEndMs) {
      continue
    }

    const anchorRoomFree = isRoomFreeAtTime(
      anchorRoomId,
      bookings,
      candidateStartMs,
      candidateEndWithBufferMs
    )

    if (!anchorRoomFree) {
      continue
    }

    let availableCapacity = 0

    for (const room of groupRooms) {
      const roomIsFree = isRoomFreeAtTime(
        room.id,
        bookings,
        candidateStartMs,
        candidateEndWithBufferMs
      )

      if (roomIsFree) {
        availableCapacity += room.capacity
      }
    }

    if (availableCapacity >= peopleCount) {
      const slot = msToTimeString(candidateStartMs)
      if (HHMM_RE.test(slot)) {
        validSlots.push(slot)
      }
    }
  }

  return Array.from(new Set(validSlots)).sort()
}

export function findRoomCombinationInGroup(
  groupRooms: Room[],
  peopleCount: number
): Room[] | null {
  const singleRoom = groupRooms.find(r => r.capacity >= peopleCount)
  if (singleRoom) return [singleRoom]

  const allValidCombinations: Room[][] = []

  function findCombinations(rooms: Room[], selected: Room[]): void {
    const totalCapacity = selected.reduce((sum, r) => sum + r.capacity, 0)
    if (totalCapacity >= peopleCount) {
      allValidCombinations.push([...selected])
      return
    }
    for (let i = 0; i < rooms.length; i++) {
      findCombinations(rooms.slice(i + 1), [...selected, rooms[i]])
    }
  }

  findCombinations(groupRooms, [])

  if (allValidCombinations.length === 0) return null

  return allValidCombinations.sort((a, b) => {
    const scoreDiff = a.reduce((s, r) => s + r.priority, 0) - b.reduce((s, r) => s + r.priority, 0)
    return scoreDiff !== 0 ? scoreDiff : a.length - b.length
  })[0]
}

/**
 * Converts room-specific time blocks into synthetic RoomBooking entries so
 * that `calculateValidSlotsForGroup` treats blocked rooms as occupied.
 *
 * IMPORTANT: No booking buffer is added to time block entries.
 */
function convertTimeBlocksToSyntheticBookings(
  date: string,
  timeBlocks: SchedulingTimeBlock[],
  allRoomIds: string[]
): RoomBooking[] {
  const synthetic: RoomBooking[] = []
  const dayStart = `${date}T00:00:00+02:00`
  const dayEnd = `${date}T23:59:59+02:00`
  const bufferMs = BOOKING_BUFFER_MINUTES * 60 * 1000

  for (const tb of timeBlocks) {
    let blockStartISO: string
    let blockEndISO: string

    if (tb.is_full_day) {
      blockStartISO = dayStart
      blockEndISO = dayEnd
    } else {
      if (!tb.start_time || !tb.end_time) continue
      const startMs = new Date(`${date}T${tb.start_time.slice(0, 5)}:00+02:00`).getTime()
      const endMs = new Date(`${date}T${tb.end_time.slice(0, 5)}:00+02:00`).getTime()
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue
      blockStartISO = new Date(startMs).toISOString()
      blockEndISO = new Date(endMs - bufferMs).toISOString()
    }

    const targetRoomIds = tb.room_id ? [tb.room_id] : allRoomIds

    for (const roomId of targetRoomIds) {
      console.log(
        `[ControlledScheduling][TimeBlock] Synthetic booking for room ${roomId}` +
        ` from ${blockStartISO} to ${blockEndISO}` +
        ` (block id=${tb.id} reason=${tb.reason || 'none'})`
      )
      synthetic.push({
        room_id: roomId,
        start_time: blockStartISO,
        end_time: blockEndISO,
      })
    }
  }

  return synthetic
}

function buildMergedBookingsForScheduling(
  date: string,
  rooms: Room[],
  bookings: RoomBooking[],
  timeBlocks?: SchedulingTimeBlock[],
  roomArea: string = 'treatment'
) {
  const activeRooms = rooms.filter((room) => room.active && room.room_area === roomArea)
  const allRoomIds = activeRooms.map((r) => r.id)

  const syntheticBlockBookings = timeBlocks && timeBlocks.length > 0
    ? convertTimeBlocksToSyntheticBookings(date, timeBlocks, allRoomIds)
    : []

  const mergedBookings = syntheticBlockBookings.length > 0
    ? [...bookings, ...syntheticBlockBookings]
    : bookings

  if (syntheticBlockBookings.length > 0) {
    console.log(
      `[ControlledScheduling] Merged ${syntheticBlockBookings.length} synthetic time-block booking(s)` +
      ` with ${bookings.length} real booking(s) for date ${date}`
    )
  }

  return {
    activeRooms,
    mergedBookings,
  }
}

export function findAllAvailableSlotsInActiveGroupWithMeta(
  date: string,
  rooms: Room[],
  bookings: RoomBooking[],
  serviceDurationMinutes: number,
  peopleCount: number,
  businessStartTime: string,
  businessEndTime: string,
  timeBlocks?: SchedulingTimeBlock[],
  roomArea: string = 'treatment'
): ActiveGroupAvailabilityResult {
  const { activeRooms, mergedBookings } = buildMergedBookingsForScheduling(
    date,
    rooms,
    bookings,
    timeBlocks,
    roomArea
  )

  const groupedRooms = groupRoomsByPriority(activeRooms)

  for (const groupNumber of [1, 2, 3, 4]) {
    const groupRooms = groupedRooms.get(groupNumber) || []
    if (groupRooms.length === 0) continue

    const validSlots = calculateValidSlotsForGroup(
      date,
      groupRooms,
      mergedBookings,
      serviceDurationMinutes,
      peopleCount,
      sanitizeHHMM(businessStartTime),
      sanitizeHHMM(businessEndTime)
    )

    console.log(
      `[ControlledScheduling] Group ${groupNumber}` +
      ` rooms=[${groupRooms.map(r => r.room_name).join(', ')}]` +
      ` validSlots=${validSlots.length}`
    )

    if (validSlots.length > 0) {
      return {
        slots: validSlots.filter((slot) => HHMM_RE.test(slot)),
        activeGroup: groupNumber,
        activeRoomIds: groupRooms.map((room) => room.id),
      }
    }
  }

  return {
    slots: [],
    activeGroup: null,
    activeRoomIds: [],
  }
}

export function findAllAvailableSlotsInActiveGroup(
  date: string,
  rooms: Room[],
  bookings: RoomBooking[],
  serviceDurationMinutes: number,
  peopleCount: number,
  businessStartTime: string,
  businessEndTime: string,
  timeBlocks?: SchedulingTimeBlock[]
): string[] {
  return findAllAvailableSlotsInActiveGroupWithMeta(
    date,
    rooms,
    bookings,
    serviceDurationMinutes,
    peopleCount,
    businessStartTime,
    businessEndTime,
    timeBlocks
  ).slots
}

/**
 * ROOM-ANCHORED availability for admin manual bookings.
 */
export function findAvailableSlotsAnchoredToRoom(
  date: string,
  rooms: Room[],
  anchorRoomId: string,
  bookings: RoomBooking[],
  serviceDurationMinutes: number,
  peopleCount: number,
  businessStartTime: string,
  businessEndTime: string,
  timeBlocks?: SchedulingTimeBlock[]
): string[] {
  const { activeRooms, mergedBookings } = buildMergedBookingsForScheduling(
    date,
    rooms,
    bookings,
    timeBlocks
  )

  const anchorRoom = activeRooms.find((r) => r.id === anchorRoomId)
  if (!anchorRoom) {
    console.log(`[ControlledScheduling] Anchor room ${anchorRoomId} not found or not active`)
    return []
  }

  const anchorGroup = getRoomGroup(anchorRoom.priority)
  const groupedRooms = groupRoomsByPriority(activeRooms)
  const groupRooms = groupedRooms.get(anchorGroup) || []

  if (groupRooms.length === 0) {
    console.log(`[ControlledScheduling] No rooms in group ${anchorGroup} for anchor room`)
    return []
  }

  const validSlots = calculateValidSlotsForGroupWithAnchor(
    date,
    groupRooms,
    anchorRoomId,
    mergedBookings,
    serviceDurationMinutes,
    peopleCount,
    sanitizeHHMM(businessStartTime),
    sanitizeHHMM(businessEndTime)
  )

  console.log(
    `[ControlledScheduling][RoomAnchored] Anchor room=${anchorRoom.room_name}` +
    ` group=${anchorGroup}` +
    ` groupRooms=[${groupRooms.map(r => r.room_name).join(', ')}]` +
    ` validSlots=${validSlots.length}`
  )

  return validSlots.filter((slot) => HHMM_RE.test(slot))
}

// ─────────────────────────────────────────────────────────────────────────────
// FIXED START TIMES + STRICT ROOM FILL (public booking flow)
//
// Rules (agreed with the client, Nov 2026):
// 1. Only the fixed start times (booking_start_times table) are offered.
// 2. Rooms are tried "best fit" first: the smallest room that holds the whole
//    party, then by priority. With today's rooms that gives:
//      1 person  → Room 7 → Room 1 → Room 2 → Room 5 → Room 6 → Room 3 → Room 4
//      2 people  → Room 1 → Room 2 → Room 5 → Room 6 → Room 3 → Room 4
//      3 people  → Room 3 → Room 4
// 3. STRICT fill: the customer only sees the free times of the first room in
//    that order that still has a free time for this service. The next room
//    only opens once that room is full for the day.
// 4. If no single room can take the party, groups may be split across rooms
//    (best combination = fewest empty beds, then fewest rooms, then priority).
// 5. Treatments may run past closing time (start time must be within hours).
//
// allocateRoom() in lib/roomAllocation.ts uses the same ordering, so the room
// whose times were shown is the room the booking lands in.
// ─────────────────────────────────────────────────────────────────────────────

export interface FixedTimeSlotResult {
  slots: string[]
  mode: 'single-room' | 'split' | 'none'
  openRoomId: string | null
}

/** Rooms that can hold the whole party alone, smallest first, then by priority. */
export function orderRoomsForParty<T extends { capacity: number; priority: number }>(
  rooms: T[],
  peopleCount: number
): T[] {
  return rooms
    .filter((r) => r.capacity >= peopleCount)
    .sort((a, b) => a.capacity - b.capacity || a.priority - b.priority)
}

/**
 * Best multi-room combination for a party: fewest empty beds, then fewest
 * rooms, then lowest total priority. Returns null if no combination fits.
 */
export function findBestRoomCombination<T extends { capacity: number; priority: number }>(
  rooms: T[],
  peopleCount: number
): T[] | null {
  let best: T[] | null = null
  let bestKey: [number, number, number] | null = null
  const n = rooms.length
  if (n > 16) return null // safety: never enumerate a huge set

  for (let mask = 1; mask < 1 << n; mask++) {
    const combo: T[] = []
    for (let i = 0; i < n; i++) if (mask & (1 << i)) combo.push(rooms[i])
    const capacity = combo.reduce((s, r) => s + r.capacity, 0)
    if (capacity < peopleCount) continue
    const key: [number, number, number] = [
      capacity - peopleCount,
      combo.length,
      combo.reduce((s, r) => s + r.priority, 0),
    ]
    if (
      !bestKey ||
      key[0] < bestKey[0] ||
      (key[0] === bestKey[0] && (key[1] < bestKey[1] || (key[1] === bestKey[1] && key[2] < bestKey[2])))
    ) {
      best = combo
      bestKey = key
    }
  }
  return best ? [...best].sort((a, b) => a.priority - b.priority) : null
}

export function findFixedTimeSlotsStrictFill(
  date: string,
  rooms: Room[],
  bookings: RoomBooking[],
  serviceDurationMinutes: number,
  peopleCount: number,
  fixedStartTimes: string[],
  businessStartTime: string,
  businessEndTime: string,
  timeBlocks?: SchedulingTimeBlock[],
  roomArea: string = 'treatment'
): FixedTimeSlotResult {
  const { activeRooms, mergedBookings } = buildMergedBookingsForScheduling(
    date,
    rooms,
    bookings,
    timeBlocks,
    roomArea
  )

  const openMs = toUtcMsFromSast(date, businessStartTime)
  const closeMs = toUtcMsFromSast(date, businessEndTime)
  const occupancyMs = (serviceDurationMinutes + BOOKING_BUFFER_MINUTES) * 60 * 1000

  // Fixed times that start within business hours (finishing late is allowed)
  const candidates = Array.from(new Set(fixedStartTimes.map(sanitizeHHMM)))
    .filter((t) => HHMM_RE.test(t))
    .map((t) => ({ label: t, ms: toUtcMsFromSast(date, t) }))
    .filter((c) => Number.isFinite(c.ms))
    .filter((c) => !Number.isFinite(openMs) || c.ms >= openMs)
    .filter((c) => !Number.isFinite(closeMs) || c.ms < closeMs)
    .sort((a, b) => a.ms - b.ms)

  const freeAt = (roomId: string, startMs: number) =>
    isRoomFreeAtTime(roomId, mergedBookings, startMs, startMs + occupancyMs)

  // 1) Strict single-room fill
  for (const room of orderRoomsForParty(activeRooms, peopleCount)) {
    const free = candidates.filter((c) => freeAt(room.id, c.ms)).map((c) => c.label)
    if (free.length > 0) {
      console.log(
        `[FixedSlots] date=${date} people=${peopleCount} open room=${room.room_name} slots=${free.join(',')}`
      )
      return { slots: free, mode: 'single-room', openRoomId: room.id }
    }
  }

  // 2) No single room can take the party — allow splitting across rooms
  const splitSlots = candidates
    .filter((c) => {
      const freeRooms = activeRooms.filter((r) => freeAt(r.id, c.ms))
      return findBestRoomCombination(freeRooms, peopleCount) !== null
    })
    .map((c) => c.label)

  console.log(
    `[FixedSlots] date=${date} people=${peopleCount} no single room free → split slots=${splitSlots.join(',') || 'none'}`
  )

  return {
    slots: splitSlots,
    mode: splitSlots.length > 0 ? 'split' : 'none',
    openRoomId: null,
  }
}
