import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { checkRoomAvailability, assignRoomsToBooking } from '@/lib/roomAllocation'

interface ReassignRoomRequest {
  bookingId: string
  newRoomId: string
}

export async function POST(request: NextRequest) {
  try {
    const supabase = supabaseAdmin
    const { bookingId, newRoomId } = (await request.json()) as ReassignRoomRequest

    if (!bookingId || !newRoomId) {
      return NextResponse.json({ error: 'Missing bookingId or newRoomId' }, { status: 400 })
    }

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, start_time, end_time, people_count, status')
      .eq('id', bookingId)
      .maybeSingle()

    if (bookingError || !booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    if (!['confirmed', 'completed'].includes(booking.status)) {
      return NextResponse.json(
        { error: 'Only confirmed or completed bookings can be reassigned' },
        { status: 400 }
      )
    }

    const { data: newRoom, error: roomError } = await supabase
      .from('rooms')
      .select('id, room_name, capacity, room_area, active')
      .eq('id', newRoomId)
      .maybeSingle()

    if (roomError || !newRoom) {
      return NextResponse.json({ error: 'Target room not found' }, { status: 404 })
    }

    if (!newRoom.active) {
      return NextResponse.json({ error: 'Target room is not active' }, { status: 400 })
    }

    if (newRoom.capacity < booking.people_count) {
      return NextResponse.json(
        {
          error: `Room "${newRoom.room_name}" has capacity ${newRoom.capacity} but booking requires ${booking.people_count} people`,
        },
        { status: 409 }
      )
    }

    const startTime = new Date(booking.start_time)
    const endTime = new Date(booking.end_time)

    const isAvailable = await checkRoomAvailability(newRoomId, startTime, endTime, bookingId)

    if (!isAvailable) {
      return NextResponse.json(
        {
          error: `Room "${newRoom.room_name}" is not available at this time — another booking conflicts`,
        },
        { status: 409 }
      )
    }

    const result = await assignRoomsToBooking(bookingId, [newRoomId])

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to reassign room' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, roomName: newRoom.room_name })
  } catch (error) {
    console.error('[ReassignRoom] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
