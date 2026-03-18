import { ROOM_GROUPS, BOOKING_BUFFER_MINUTES } from './timeSlots'

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

  if (Number.isFinite(businessStartMs)) {
    candidates.add(businessStartMs)
  }

  const groupRoomIds = new Set(groupRooms.map((room) => room.id))

  for (const booking of bookings) {
    if (!groupRoomIds.has(booking.room_id)) continue

    const bookingEndWithBufferMs =
      new Date(booking.end_time).getTime() + BOOKING_BUFFER_MINUTES * 60 * 1000

    if (
      Number.isFinite(bookingEndWithBufferMs) &&
      bookingEndWithBufferMs >= businessStartMs &&
      bookingEndWithBufferMs <= businessEndMs
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

export function findAllAvailableSlotsInActiveGroup(
  date: string,
  rooms: Room[],
  bookings: RoomBooking[],
  serviceDurationMinutes: number,
  peopleCount: number,
  businessStartTime: string,
  businessEndTime: string
): string[] {
  const groupedRooms = groupRoomsByPriority(
    rooms.filter((room) => room.active && room.room_area === 'treatment')
  )

  for (const groupNumber of [1, 2, 3, 4]) {
    const groupRooms = groupedRooms.get(groupNumber) || []
    if (groupRooms.length === 0) continue

    const validSlots = calculateValidSlotsForGroup(
      date,
      groupRooms,
      bookings,
      serviceDurationMinutes,
      peopleCount,
      sanitizeHHMM(businessStartTime),
      sanitizeHHMM(businessEndTime)
    )

    if (validSlots.length > 0) {
      return validSlots.filter((slot) => HHMM_RE.test(slot))
    }
  }

  return []
}
