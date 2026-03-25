import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { checkRoomAvailability, getBlockingTimeBlock } from '@/lib/roomAllocation'

interface RoomAssignmentInput {
  roomId: string
  people: number
}

export async function POST(request: NextRequest) {
  try {
    const supabase = supabaseAdmin
    const { selectedDate, selectedTime, totalDuration, roomAssignments } = await request.json() as {
      selectedDate: string
      selectedTime: string
      totalDuration: number
      roomAssignments: RoomAssignmentInput[]
    }

    const errors: string[] = []

    if (!selectedDate || !selectedTime || !totalDuration || totalDuration <= 0) {
      return NextResponse.json({ valid: false, errors: ['Date, time, and duration are required'] })
    }

    if (!roomAssignments || roomAssignments.length === 0) {
      return NextResponse.json({ valid: false, errors: ['At least one room must be assigned'] })
    }

    const startDateTime = new Date(`${selectedDate}T${selectedTime}:00+02:00`)
    const endDateTime = new Date(startDateTime.getTime() + totalDuration * 60000)

    if (Number.isNaN(startDateTime.getTime())) {
      return NextResponse.json({ valid: false, errors: ['Invalid date or time'] })
    }

    // Check for duplicate room IDs in assignments
    const roomIds = roomAssignments.map(ra => ra.roomId)
    if (new Set(roomIds).size !== roomIds.length) {
      errors.push('Duplicate room assignments are not allowed')
    }

    // Validate each room individually
    for (const assignment of roomAssignments) {
      const { data: room } = await supabase
        .from('rooms')
        .select('id, room_name, capacity, active')
        .eq('id', assignment.roomId)
        .maybeSingle()

      if (!room) {
        errors.push(`Room not found: ${assignment.roomId}`)
        continue
      }

      if (!room.active) {
        errors.push(`Room "${room.room_name}" is not active`)
        continue
      }

      if (assignment.people <= 0) {
        errors.push(`Room "${room.room_name}": people count must be at least 1`)
        continue
      }

      if (assignment.people > room.capacity) {
        errors.push(`Room "${room.room_name}" capacity is ${room.capacity} but ${assignment.people} people assigned`)
        continue
      }

      // Check for conflicting time blocks
      const blockingBlock = await getBlockingTimeBlock(assignment.roomId, startDateTime, endDateTime)
      if (blockingBlock) {
        const blockDesc = blockingBlock.is_full_day
          ? 'all day'
          : `${blockingBlock.start_time?.slice(0, 5)} to ${blockingBlock.end_time?.slice(0, 5)}`
        errors.push(`Room "${room.room_name}" is blocked ${blockDesc}`)
        continue
      }

      // Check for conflicting bookings
      const isAvailable = await checkRoomAvailability(assignment.roomId, startDateTime, endDateTime)
      if (!isAvailable) {
        errors.push(`Room "${room.room_name}" already has a booking that conflicts with ${selectedTime}–${
          (() => {
            const [h, m] = selectedTime.split(':').map(Number)
            const endMin = h * 60 + m + totalDuration
            return `${String(Math.floor(endMin / 60) % 24).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`
          })()
        }`)
      }
    }

    if (errors.length > 0) {
      return NextResponse.json({ valid: false, errors })
    }

    return NextResponse.json({ valid: true, errors: [] })
  } catch (error) {
    console.error('[AdminBookingValidate] error:', error)
    return NextResponse.json({ valid: false, errors: ['Internal server error during validation'] }, { status: 500 })
  }
}
