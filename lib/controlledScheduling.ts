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

const SAST_OFFSET_MS = 2 * 60 * 60 * 1000
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

    // Booking must fully fit inside business hours including buffer
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

  return groups
}

export function findRoomCombinationInGroup(
  groupRooms: Room[],
  peopleCount: number
): Room[] | null {
  if (peopleCount <= 3) {
    const singleRoom = groupRooms.find(r => r.capacity >= peopleCount)
    return singleRoom ? [singleRoom] : null
  }

  const allValidCombinations: Room[][] = []

  function findAllCombinations(rooms: Room[], selected: Room[] = []): void {
    const totalCapacity = selected.reduce((sum, r) => sum + r.capacity, 0)

    if (totalCapacity >= peopleCount) {
      allValidCombinations.push([...selected])
      return
    }

    for (let i = 0; i < rooms.length; i++) {
      const room = rooms[i]
      if (selected.includes(room)) continue

      const newSelected = [...selected, room]
      const remainingRooms = rooms.slice(i + 1)
      findAllCombinations(remainingRooms, newSelected)
    }
  }

  findAllCombinations(groupRooms)

  if (allValidCombinations.length === 0) {
    return null
  }

  const scoredCombinations = allValidCombinations.map(combo => {
    const priorityScore = combo.reduce((sum, r) => sum + r.priority, 0)
    const roomCount = combo.length
    return { combo, priorityScore, roomCount }
  })

  scoredCombinations.sort((a, b) => {
    if (a.priorityScore !== b.priorityScore) {
      return a.priorityScore - b.priorityScore
    }
    return a.roomCount - b.roomCount
  })

  return scoredCombinations[0].combo
}

export function checkSlotAvailableForRooms(
  slotStartMs: number,
  slotEndMs: number,
  rooms: Room[],
  allBookings: RoomBooking[],
  bufferMs: number
): boolean {
  const roomIds = new Set(rooms.map(r => r.id))

  for (const booking of allBookings) {
    if (!roomIds.has(booking.room_id)) continue

    const bookingStart = new Date(booking.start_time).getTime()
    const bookingEnd = new Date(booking.end_time).getTime()
    const bookingEndWithBuffer = bookingEnd + bufferMs

    if (slotStartMs < bookingEndWithBuffer && slotEndMs > bookingStart) {
      return false
    }
  }

  return true
}

function msToTimeString(ms: number): string {
  if (!Number.isFinite(ms)) return 'NaN:NaN'
  const SAST_OFFSET_MS = 2 * 60 * 60 * 1000
  const localMs = ms + SAST_OFFSET_MS
  const totalMinutes = Math.floor(localMs / 60000) % (24 * 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function calculateValidSlotsForRoom(
  room: Room,
  date: string,
  serviceDurationMinutes: number,
  allBookings: RoomBooking[],
  businessStartTime: string,
  businessEndTime: string
): string[] {
  const bufferMs = BOOKING_BUFFER_MINUTES * 60000
  const serviceDurationMs = serviceDurationMinutes * 60000
  const roomBookings = allBookings
    .filter(b => b.room_id === room.id)
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())

  const startOfDay = new Date(`${date}T${businessStartTime}:00+02:00`).getTime()
  const endOfDay = new Date(`${date}T${businessEndTime}:00+02:00`).getTime()

  const candidateTimes: number[] = [startOfDay]

  for (const booking of roomBookings) {
    const bookingEnd = new Date(booking.end_time).getTime()
    const nextAvailable = bookingEnd + bufferMs
    if (nextAvailable < endOfDay) {
      candidateTimes.push(nextAvailable)
    }
  }

  const validSlots: string[] = []

  for (const candidateMs of candidateTimes) {
    const slotEndMs = candidateMs + serviceDurationMs

    if (slotEndMs > endOfDay) continue

    let hasConflict = false
    for (const booking of roomBookings) {
      const bookingStart = new Date(booking.start_time).getTime()
      const bookingEnd = new Date(booking.end_time).getTime()
      const bookingEndWithBuffer = bookingEnd + bufferMs

      if (candidateMs < bookingEndWithBuffer && slotEndMs > bookingStart) {
        hasConflict = true
        break
      }
    }

    if (!hasConflict) {
      const formatted = msToTimeString(candidateMs)
      if (/^\d{2}:\d{2}$/.test(formatted)) {
        validSlots.push(formatted)
      }
    }
  }

  return validSlots
}

export function findAllAvailableSlotsInActiveGroup(
  date: string,
  serviceDurationMinutes: number,
  peopleCount: number,
  allRooms: Room[],
  allBookings: RoomBooking[],
  businessStartTime: string = '08:00',
  businessEndTime: string = '18:00'
): { slots: string[]; groupNumber: number } | null {
  const bufferMs = BOOKING_BUFFER_MINUTES * 60000
  const roomGroups = groupRoomsByPriority(allRooms)

  for (let groupNum = 1; groupNum <= 3; groupNum++) {
    const groupRooms = roomGroups.get(groupNum)
    if (!groupRooms || groupRooms.length === 0) continue

    const allValidSlotsSet = new Set<string>()

    for (const room of groupRooms) {
      const roomValidSlots = calculateValidSlotsForRoom(
        room,
        date,
        serviceDurationMinutes,
        allBookings,
        businessStartTime,
        businessEndTime
      )

      for (const slot of roomValidSlots) {
        const slotStartMs = new Date(`${date}T${slot}:00+02:00`).getTime()
        const slotEndMs = slotStartMs + serviceDurationMinutes * 60000

        const availableRoomsInGroup = groupRooms.filter(r => {
          const roomBookings = allBookings.filter(b => b.room_id === r.id)
          return checkSlotAvailableForRooms(slotStartMs, slotEndMs, [r], roomBookings, bufferMs)
        })

        const roomCombination = findRoomCombinationInGroup(availableRoomsInGroup, peopleCount)

        if (roomCombination && roomCombination.length > 0) {
          const allRoomsAvailable = checkSlotAvailableForRooms(
            slotStartMs,
            slotEndMs,
            roomCombination,
            allBookings,
            bufferMs
          )

          if (allRoomsAvailable) {
            allValidSlotsSet.add(slot)
          }
        }
      }
    }

    if (allValidSlotsSet.size > 0) {
      const sortedSlots = Array.from(allValidSlotsSet).sort()
      return {
        slots: sortedSlots,
        groupNumber: groupNum
      }
    }
  }

  return null
}
