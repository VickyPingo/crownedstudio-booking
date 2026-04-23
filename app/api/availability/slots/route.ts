import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import {
  findAllAvailableSlotsInActiveGroupWithMeta,
  Room,
  RoomBooking,
  SchedulingTimeBlock,
} from '@/lib/controlledScheduling'
import { isActiveBooking } from '@/lib/bookingFilters'

interface AvailabilityRequest {
  date: string
  serviceSlug: string
  serviceDurationMinutes: number
  peopleCount: number
}

// ✅ CONSTANTS
const NORMAL_HOURS_START = '08:30'
const NORMAL_HOURS_END = '17:30'

const CROWNED_NIGHT_SLUGS = ['crowned-night-a', 'crowned-night-b']
const EVENING_START_TIME = '17:30'
const EVENING_MAX_BOOKINGS = 2
const EVENING_MAX_PEOPLE = 4

// ✅ HELPERS
function getUtcRangeForSastDate(date: string) {
  return {
    start: new Date(`${date}T00:00:00+02:00`).toISOString(),
    end: new Date(`${date}T23:59:59.999+02:00`).toISOString(),
  }
}

function sanitizeHHMM(value: string): string {
  if (!value) return ''
  const [h = '00', m = '00'] = value.split(':')
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`
}

// ✅ EVENING LOGIC
async function getEveningAvailability(
  date: string,
  peopleCount: number,
  supabase: typeof supabaseAdmin
): Promise<{ availableSlots: string[]; isFullyBlocked: boolean }> {
  const { start, end } = getUtcRangeForSastDate(date)

  const { data, error } = await supabase
    .from('bookings')
    .select('status, payment_expires_at, people_count, service_slug')
    .gte('start_time', start)
    .lte('start_time', end)
    .in('service_slug', CROWNED_NIGHT_SLUGS)

  if (error) return { availableSlots: [], isFullyBlocked: true }

  const active = (data || []).filter((b: any) =>
    isActiveBooking(b.status, b.payment_expires_at)
  )

  const totalBookings = active.length
  const totalPeople = active.reduce((sum: number, b: any) => sum + (b.people_count || 0), 0)

  if (
    totalBookings >= EVENING_MAX_BOOKINGS ||
    totalPeople >= EVENING_MAX_PEOPLE ||
    totalBookings + 1 > EVENING_MAX_BOOKINGS ||
    totalPeople + peopleCount > EVENING_MAX_PEOPLE
  ) {
    return { availableSlots: [], isFullyBlocked: true }
  }

  return { availableSlots: [EVENING_START_TIME], isFullyBlocked: false }
}

// ✅ MAIN ROUTE
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as AvailabilityRequest
    const { date, serviceSlug, serviceDurationMinutes, peopleCount } = body

    if (!date || !serviceDurationMinutes || !peopleCount) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // ✅ SERVICE EXCLUSIONS
    const blockedServiceDates: Record<string, string[]> = {
      'relaxation-renewal': ['2026-05-09', '2026-05-10'],
      'complete-body-care': ['2026-05-09', '2026-05-10'],
      'massage-creative-escape': ['2026-05-09', '2026-05-10'],
      'ultimate-relaxation': ['2026-05-09', '2026-05-10'],
      'massage-facial-bliss': ['2026-05-09', '2026-05-10'],
    }

    if (blockedServiceDates[serviceSlug]?.includes(date)) {
      return NextResponse.json({ availableSlots: [], isFullyBlocked: true })
    }

    const supabase = supabaseAdmin

    // ✅ EVENING HANDLING
    if (CROWNED_NIGHT_SLUGS.includes(serviceSlug)) {
      return NextResponse.json(
        await getEveningAvailability(date, peopleCount, supabase)
      )
    }

    const { start, end } = getUtcRangeForSastDate(date)

    // Load active treatment rooms
    const { data: rooms } = await supabase
      .from('rooms')
      .select('*')
      .eq('active', true)
      .eq('room_area', 'treatment')
      .order('priority', { ascending: true })

    // Load all bookings for the day
    const { data: bookingsRaw } = await supabase
      .from('bookings')
      .select('id, start_time, end_time, room_id, status, payment_expires_at')
      .gte('start_time', start)
      .lte('start_time', end)

    const activeBookings = (bookingsRaw || []).filter((b: any) =>
      isActiveBooking(b.status, b.payment_expires_at)
    )

    // ✅ KEY FIX: Load booking_rooms — modern bookings store room assignments here,
    // NOT on the booking's room_id field. Without this, fully-booked days appear empty.
    const bookingIds = activeBookings.map((b: any) => b.id)
    let bookingRoomsData: { booking_id: string; room_id: string }[] = []
    if (bookingIds.length > 0) {
      const { data: brData } = await supabase
        .from('booking_rooms')
        .select('booking_id, room_id')
        .in('booking_id', bookingIds)
      bookingRoomsData = brData || []
    }

    // Build merged RoomBooking list:
    // - booking_rooms is authoritative for modern bookings
    // - fall back to legacy room_id only if no booking_rooms entry exists
    const roomBookings: RoomBooking[] = []
    const seen = new Set<string>()

    for (const booking of activeBookings) {
      const extraRooms = bookingRoomsData.filter((row) => row.booking_id === booking.id)

      if (extraRooms.length > 0) {
        // Modern booking: room assignments are in booking_rooms
        for (const row of extraRooms) {
          const key = `${booking.id}:${row.room_id}`
          if (!seen.has(key)) {
            seen.add(key)
            roomBookings.push({
              room_id: row.room_id,
              start_time: booking.start_time,
              end_time: booking.end_time,
            })
          }
        }
      } else if (booking.room_id) {
        // Legacy booking: room_id is on the booking itself
        const key = `${booking.id}:${booking.room_id}`
        if (!seen.has(key)) {
          seen.add(key)
          roomBookings.push({
            room_id: booking.room_id,
            start_time: booking.start_time,
            end_time: booking.end_time,
          })
        }
      }
    }

    // Load time blocks
    const { data: timeBlocksRaw } = await supabase
      .from('time_blocks')
      .select('*')
      .eq('block_date', date)

    const timeBlocks = (timeBlocksRaw || []) as SchedulingTimeBlock[]

    const slotResult = findAllAvailableSlotsInActiveGroupWithMeta(
      date,
      rooms || [],
      roomBookings,
      serviceDurationMinutes,
      peopleCount,
      sanitizeHHMM(NORMAL_HOURS_START),
      sanitizeHHMM(NORMAL_HOURS_END),
      timeBlocks
    )

    console.log(
      `[Availability] date=${date} service=${serviceSlug}` +
      ` activeBookings=${activeBookings.length} roomBookings=${roomBookings.length}` +
      ` slots=${slotResult.slots.length} group=${slotResult.activeGroup}`
    )

    return NextResponse.json({
      availableSlots: slotResult.slots,
      isFullyBlocked: slotResult.slots.length === 0,
    })
  } catch (error) {
    console.error('[Availability] Error:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
