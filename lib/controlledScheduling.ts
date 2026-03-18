import { ROOM_GROUPS, BOOKING_BUFFER_MINUTES, NORMAL_HOURS_START_TIME } from './timeSlots'

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

export function findEarliestAvailableSlot(
  date: string,
  serviceDurationMinutes: number,
  peopleCount: number,
  allRooms: Room[],
  allBookings: RoomBooking[],
  allPossibleSlots: string[]
): { slot: string; rooms: Room[]; groupNumber: number } | null {
  const bufferMs = BOOKING_BUFFER_MINUTES * 60000
  const roomGroups = groupRoomsByPriority(allRooms)

  for (const slot of allPossibleSlots) {
    const slotStartMs = new Date(`${date}T${slot}:00+02:00`).getTime()
    const slotEndMs = slotStartMs + serviceDurationMinutes * 60000

    for (let groupNum = 1; groupNum <= 3; groupNum++) {
      const groupRooms = roomGroups.get(groupNum)
      if (!groupRooms || groupRooms.length === 0) continue

      const availableRoomsInGroup = groupRooms.filter(room => {
        const roomBookings = allBookings.filter(b => b.room_id === room.id)
        return checkSlotAvailableForRooms(slotStartMs, slotEndMs, [room], roomBookings, bufferMs)
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
          return {
            slot,
            rooms: roomCombination,
            groupNumber: groupNum
          }
        }
      }
    }
  }

  return null
}
