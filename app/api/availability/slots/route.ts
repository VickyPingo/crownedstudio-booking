import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { generateTimeSlots, isDateFullyBlocked, isSameDayBooking, TimeSlotConfig, TimeBlock } from '@/lib/timeSlots'
import { CLEANUP_BUFFER_MINUTES } from '@/lib/roomAllocation'
import { findEarliestAvailableSlot } from '@/lib/controlledScheduling'

interface AvailabilityRequest {
  date: string
  serviceSlug: string
  serviceDurationMinutes: number
  peopleCount: number
}

interface RoomBooking {
  id: string
  start_time: string
  end_time: string
  room_id: string
  status: string
  payment_expires_at?: string | null
}

interface BookingRoom {
  booking_id: string
  room_id: string
  bookings: {
    id: string
    start_time: string
    end_time: string
    status: string
    payment_expires_at?: string | null
  }
}


export async function POST(request: NextRequest) {
  try {
    const body: AvailabilityRequest = await request.json()
    const { date, serviceSlug, serviceDurationMinutes, peopleCount } = body

    console.log('[Availability] Request:', { date, serviceSlug, serviceDurationMinutes, peopleCount })

    if (!date || !serviceSlug || !serviceDurationMinutes) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (isSameDayBooking(date)) {
      return NextResponse.json({
        availableSlots: [],
        isFullyBlocked: true,
        error: 'Same-day bookings are not allowed. Please choose a date from tomorrow onward.'
      })
    }

    const supabase = supabaseAdmin

    const { data: service } = await supabase
      .from('services')
      .select('service_area')
      .eq('slug', serviceSlug)
      .maybeSingle()

    const serviceArea = service?.service_area || 'treatment'

    const { data: allRooms } = await supabase
      .from('rooms')
      .select('id, room_name, room_area, capacity, priority, active')
      .eq('active', true)
      .eq('room_area', serviceArea)
      .order('priority', { ascending: true })

    console.log('[Availability] All rooms:', allRooms?.map(r => ({ name: r.room_name, capacity: r.capacity, priority: r.priority })))

    if (!allRooms || allRooms.length === 0) {
      console.log('[Availability] No rooms found for service area:', serviceArea)
      return NextResponse.json({ availableSlots: [], isFullyBlocked: true })
    }

    const dayStart = new Date(`${date}T00:00:00+02:00`)
    const dayEnd = new Date(`${date}T23:59:59+02:00`)

    const now = new Date().toISOString()
    const { data: legacyBookings } = await supabase
      .from('bookings')
      .select('id, start_time, end_time, room_id, status, payment_expires_at')
      .in('status', ['confirmed', 'pending_payment'])
      .gte('start_time', dayStart.toISOString())
      .lte('start_time', dayEnd.toISOString())
      .not('room_id', 'is', null)

    const { data: bookingRooms } = await supabase
      .from('booking_rooms')
      .select('booking_id, room_id, bookings!inner(id, start_time, end_time, status, payment_expires_at)')
      .gte('bookings.start_time', dayStart.toISOString())
      .lte('bookings.start_time', dayEnd.toISOString())
      .in('bookings.status', ['confirmed', 'pending_payment'])

    const activeLegacyBookings = (legacyBookings || []).filter(booking => {
      if (booking.status === 'confirmed') return true
      if (booking.status === 'pending_payment') {
        return !booking.payment_expires_at || booking.payment_expires_at > now
      }
      return false
    })

    const activeBookingRooms = (bookingRooms || []).filter(br => {
      const booking = (br as any).bookings
      if (booking.status === 'confirmed') return true
      if (booking.status === 'pending_payment') {
        return !booking.payment_expires_at || booking.payment_expires_at > now
      }
      return false
    })

    const { data: timeBlocksData } = await supabase
      .from('time_blocks')
      .select('id, block_date, start_time, end_time, is_full_day, reason')
      .eq('block_date', date)

    const timeBlocks: TimeBlock[] = timeBlocksData || []

    if (isDateFullyBlocked(timeBlocks)) {
      return NextResponse.json({ availableSlots: [], isFullyBlocked: true })
    }

    const parsedDate = new Date(date)
    const dayOfWeek = parsedDate.getDay()

    const { data: businessHoursData } = await supabase
      .from('business_hours')
      .select('open_time, close_time, after_hours_enabled, after_hours_end_time')
      .eq('day_of_week', dayOfWeek)
      .maybeSingle()

    if (!businessHoursData) {
      return NextResponse.json({ availableSlots: [], isFullyBlocked: true })
    }

    const { data: serviceTimeWindowData } = await supabase
      .from('service_time_windows')
      .select('service_slug, start_time, end_time')
      .eq('service_slug', serviceSlug)
      .maybeSingle()

    const config: TimeSlotConfig = {
      serviceSlug,
      serviceDurationMinutes,
      businessHours: businessHoursData,
      serviceTimeWindow: serviceTimeWindowData || null,
      timeBlocks,
    }

    const allPossibleSlots = generateTimeSlots(config)

    const allBookings: { start_time: string; end_time: string; room_id: string }[] = []

    for (const booking of activeLegacyBookings) {
      if (booking.room_id) {
        allBookings.push({
          start_time: booking.start_time,
          end_time: booking.end_time,
          room_id: booking.room_id
        })
      }
    }

    for (const br of activeBookingRooms) {
      const booking = (br as any).bookings
      allBookings.push({
        start_time: booking.start_time,
        end_time: booking.end_time,
        room_id: br.room_id
      })
    }

    const result = findEarliestAvailableSlot(
      date,
      serviceDurationMinutes,
      peopleCount || 1,
      allRooms,
      allBookings,
      allPossibleSlots
    )

    if (!result) {
      console.log('[Availability] No available slots found')
      return NextResponse.json({
        availableSlots: [],
        isFullyBlocked: false,
      })
    }

    console.log('[Availability] Found earliest slot:', {
      slot: result.slot,
      group: result.groupNumber,
      rooms: result.rooms.map(r => r.room_name).join(', ')
    })

    return NextResponse.json({
      availableSlots: [result.slot],
      isFullyBlocked: false,
    })
  } catch (error) {
    console.error('Availability check error:', error)
    return NextResponse.json({ error: 'Failed to check availability' }, { status: 500 })
  }
}
