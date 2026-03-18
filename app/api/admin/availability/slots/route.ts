import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import {
  generateTimeSlots,
  BOOKING_BUFFER_MINUTES,
  LATEST_START_TIME,
  NORMAL_HOURS_START_TIME,
  BusinessHours,
  TimeSlotConfig,
  TimeBlock,
} from '@/lib/timeSlots'

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

function doOverlapWithBuffer(
  newStartMin: number,
  newEndMin: number,
  existingStartMin: number,
  existingEndMin: number
): boolean {
  const bufferedEnd = existingEndMin + BOOKING_BUFFER_MINUTES
  return newStartMin < bufferedEnd && newEndMin > existingStartMin
}

export async function POST(request: NextRequest) {
  try {
    const supabase = supabaseAdmin
    const { date, serviceSlug, serviceDurationMinutes, roomId } = await request.json()

    if (!date || !serviceSlug || !serviceDurationMinutes) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const localDate = new Date(date + 'T00:00:00')
    const dayOfWeek = localDate.getDay()

    const { data: hoursRow } = await supabase
      .from('business_hours')
      .select('*')
      .eq('day_of_week', dayOfWeek)
      .maybeSingle()

    const businessHours: BusinessHours = hoursRow
      ? {
          open_time: hoursRow.open_time,
          close_time: hoursRow.close_time,
          after_hours_enabled: hoursRow.after_hours_enabled,
          after_hours_end_time: hoursRow.after_hours_end_time,
        }
      : {
          open_time: NORMAL_HOURS_START_TIME,
          close_time: '17:30',
          after_hours_enabled: false,
          after_hours_end_time: null,
        }

    const { data: timeWindowRow } = await supabase
      .from('service_time_windows')
      .select('service_slug, start_time, end_time')
      .eq('service_slug', serviceSlug)
      .maybeSingle()

    const dayStartISO = new Date(date + 'T00:00:00+02:00').toISOString()
    const dayEndISO = new Date(date + 'T23:59:59+02:00').toISOString()

    const { data: timeBlocksRaw } = await supabase
      .from('time_blocks')
      .select('*')
      .eq('block_date', date)

    const timeBlocks: TimeBlock[] = (timeBlocksRaw || []).filter((tb: any) => {
      if (roomId) {
        return tb.room_id === roomId || (!tb.room_id && tb.is_full_day)
      }
      return tb.is_full_day || !tb.room_id
    }) as TimeBlock[]

    const config: TimeSlotConfig = {
      serviceSlug,
      serviceDurationMinutes,
      businessHours,
      serviceTimeWindow: timeWindowRow || null,
      timeBlocks,
    }

    const candidateSlots = generateTimeSlots(config)

    const existingBookingTimes: { startMin: number; endMin: number }[] = []

    if (roomId) {
      const { data: directBookings } = await supabase
        .from('bookings')
        .select('start_time, end_time')
        .eq('room_id', roomId)
        .in('status', ['confirmed', 'completed', 'pending_payment'])
        .gte('start_time', dayStartISO)
        .lte('start_time', dayEndISO)

      const { data: brBookings } = await supabase
        .from('booking_rooms')
        .select('bookings!inner(start_time, end_time, status, payment_expires_at)')
        .eq('room_id', roomId)
        .gte('bookings.start_time', dayStartISO)
        .lte('bookings.start_time', dayEndISO)
        .in('bookings.status', ['confirmed', 'completed', 'pending_payment'])

      const now = new Date().toISOString()

      if (directBookings) {
        for (const b of directBookings) {
          const startLocal = new Date(b.start_time)
          const endLocal = new Date(b.end_time)
          const startMin = startLocal.getHours() * 60 + startLocal.getMinutes()
          const endMin = endLocal.getHours() * 60 + endLocal.getMinutes()
          existingBookingTimes.push({ startMin, endMin })
        }
      }

      if (brBookings) {
        for (const br of brBookings) {
          const booking = (br as any).bookings
          if (booking.status === 'pending_payment' && booking.payment_expires_at && booking.payment_expires_at <= now) {
            continue
          }
          const startLocal = new Date(booking.start_time)
          const endLocal = new Date(booking.end_time)
          const startMin = startLocal.getHours() * 60 + startLocal.getMinutes()
          const endMin = endLocal.getHours() * 60 + endLocal.getMinutes()
          existingBookingTimes.push({ startMin, endMin })
        }
      }
    } else {
      const { data: allBookings } = await supabase
        .from('bookings')
        .select('start_time, end_time, status, payment_expires_at')
        .in('status', ['confirmed', 'completed', 'pending_payment'])
        .gte('start_time', dayStartISO)
        .lte('start_time', dayEndISO)

      const now = new Date().toISOString()

      if (allBookings) {
        for (const b of allBookings) {
          if (b.status === 'pending_payment' && b.payment_expires_at && b.payment_expires_at <= now) continue
          const startLocal = new Date(b.start_time)
          const endLocal = new Date(b.end_time)
          const startMin = startLocal.getHours() * 60 + startLocal.getMinutes()
          const endMin = endLocal.getHours() * 60 + endLocal.getMinutes()
          existingBookingTimes.push({ startMin, endMin })
        }
      }
    }

    const availableSlots = candidateSlots.filter((slot) => {
      const slotStartMin = timeToMinutes(slot)
      const slotEndMin = slotStartMin + serviceDurationMinutes

      for (const booking of existingBookingTimes) {
        if (doOverlapWithBuffer(slotStartMin, slotEndMin, booking.startMin, booking.endMin)) {
          return false
        }
      }

      return true
    })

    return NextResponse.json({ availableSlots })
  } catch (error) {
    console.error('[AdminAvailabilitySlots] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
