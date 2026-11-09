import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import {
  findAllAvailableSlotsInActiveGroupWithMeta,
  findFixedTimeSlotsStrictFill,
  Room,
  RoomBooking,
  SchedulingTimeBlock,
} from '@/lib/controlledScheduling'
import { isActiveBooking } from '@/lib/bookingFilters'
import { getFixedStartTimes } from '@/lib/fixedStartTimes'
import { getPromoRule, isAfterLastBookingDate } from '@/lib/promoRules'

interface AvailabilityRequest {
  date: string
  serviceSlug: string
  serviceDurationMinutes: number
  peopleCount: number
}

const CROWNED_NIGHT_SLUGS = ['crowned-night-a', 'crowned-night-b']
const EVENING_START_TIME = '17:30'
const EVENING_MAX_BOOKINGS = 2
const EVENING_MAX_PEOPLE = 4

// Fallback if business_hours query fails
const FALLBACK_OPEN = '08:30'
const FALLBACK_CLOSE = '16:30'

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

    // ✅ PROMO RULES (last booking date, public holidays) — see lib/promoRules.ts
    const promoRule = getPromoRule(serviceSlug)
    if (promoRule) {
      if (isAfterLastBookingDate(serviceSlug, date)) {
        return NextResponse.json({ availableSlots: [], isFullyBlocked: true })
      }
      if (promoRule.blockPublicHolidays) {
        const { data: holiday } = await supabaseAdmin
          .from('public_holidays')
          .select('id')
          .eq('date', date)
          .eq('active', true)
          .limit(1)
        if (holiday && holiday.length > 0) {
          return NextResponse.json({ availableSlots: [], isFullyBlocked: true })
        }
      }
    }

    // ✅ DAY-OF-WEEK RESTRICTION
    if (serviceSlug) {
      const { data: timeWindowForDay } = await supabaseAdmin
        .from('service_time_windows')
        .select('days_allowed')
        .eq('service_slug', serviceSlug)
        .maybeSingle()

      if (timeWindowForDay?.days_allowed) {
        const DAY_ABBRS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
        const dayIndex = new Date(`${date}T12:00:00+02:00`).getDay()
        const todayAbbr = DAY_ABBRS[dayIndex]
        const allowedDays = (timeWindowForDay.days_allowed as string)
          .split(',')
          .map((d: string) => d.trim().toUpperCase())
        if (!allowedDays.includes(todayAbbr)) {
          return NextResponse.json({ availableSlots: [], isFullyBlocked: true })
        }
      }
    }

    const supabase = supabaseAdmin

    // ✅ EVENING HANDLING
    if (CROWNED_NIGHT_SLUGS.includes(serviceSlug)) {
      return NextResponse.json(
        await getEveningAvailability(date, peopleCount, supabase)
      )
    }

    // ✅ BUSINESS HOURS — query DB for the actual day, same as admin route
    const dayOfWeek = new Date(`${date}T12:00:00+02:00`).getDay()
    const { data: hoursRow } = await supabase
      .from('business_hours')
      .select('open_time, close_time, after_hours_enabled, after_hours_end_time')
      .eq('day_of_week', dayOfWeek)
      .maybeSingle()

    const openTime = sanitizeHHMM(hoursRow?.open_time ?? FALLBACK_OPEN)
    const closeTime = sanitizeHHMM(hoursRow?.close_time ?? FALLBACK_CLOSE)

    console.log(`[Availability] date=${date} day=${dayOfWeek} open=${openTime} close=${closeTime}`)

    const { start, end } = getUtcRangeForSastDate(date)

    // ✅ SERVICE AREA — determines which room pool this service draws from
    // (mirrors app/api/bookings/create/route.ts so slot availability matches
    // what room allocation will actually do at booking time)
    let serviceArea = 'treatment'
    if (serviceSlug) {
      const { data: serviceRow } = await supabase
        .from('services')
        .select('service_area')
        .eq('slug', serviceSlug)
        .maybeSingle()
      serviceArea = serviceRow?.service_area || 'treatment'
    }

    // Load rooms (matching the service's area, active)
    const { data: rooms } = await supabase
      .from('rooms')
      .select('*')
      .eq('active', true)
      .eq('room_area', serviceArea)
      .order('priority', { ascending: true })

    // ✅ ROOM SERVICE RESTRICTIONS
    const roomIds = (rooms || []).map((r: any) => r.id)

    const { data: roomRestrictions } = await supabase
      .from('room_allowed_services')
      .select('room_id, service_slug')
      .in('room_id', roomIds)

    const restrictionMap = new Map<string, Set<string>>()
    for (const row of roomRestrictions || []) {
      if (!restrictionMap.has(row.room_id)) restrictionMap.set(row.room_id, new Set())
      restrictionMap.get(row.room_id)!.add(row.service_slug)
    }

    // Restricted rooms (Room 7) are open to ALL services for 1-person bookings,
    // mirroring allocateRoom() in lib/roomAllocation.ts.
    const eligibleRooms = (rooms || []).filter((room: any) => {
      const allowed = restrictionMap.get(room.id)
      if (!allowed || allowed.size === 0) return true
      if (peopleCount === 1) return true
      if (!serviceSlug) return false
      return allowed.has(serviceSlug)
    })

    // Load bookings for this day
    const { data: bookings } = await supabase
      .from('bookings')
      .select('id, start_time, end_time, room_id, status, payment_expires_at')
      .gte('start_time', start)
      .lte('start_time', end)

    const activeBookings = (bookings || []).filter((b: any) =>
      isActiveBooking(b.status, b.payment_expires_at)
    )

    // ✅ FETCH booking_rooms for modern bookings (source of truth)
    const bookingIds = activeBookings.map((b: any) => b.id)
    let bookingRoomsData: { booking_id: string; room_id: string }[] = []
    if (bookingIds.length > 0) {
      const { data: brData } = await supabase
        .from('booking_rooms')
        .select('booking_id, room_id')
        .in('booking_id', bookingIds)
      bookingRoomsData = brData || []
    }

    // Build merged RoomBooking list
    const roomBookings: RoomBooking[] = []
    const seen = new Set<string>()

    for (const booking of activeBookings) {
      const extraRooms = bookingRoomsData.filter((row) => row.booking_id === booking.id)

      if (extraRooms.length > 0) {
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

    // A full-day global block means the spa is closed — not just booked out.
    const isClosedAllDay = timeBlocks.some((b) => b.is_full_day && !b.room_id)
    if (isClosedAllDay) {
      return NextResponse.json({ availableSlots: [], isFullyBlocked: true })
    }

    // ✅ FIXED START TIMES + STRICT ROOM FILL (areas with booking_start_times rows)
    const fixedStartTimes = await getFixedStartTimes(serviceArea, supabase)

    if (fixedStartTimes.length > 0) {
      const fixedResult = findFixedTimeSlotsStrictFill(
        date,
        eligibleRooms as Room[],
        roomBookings,
        serviceDurationMinutes,
        peopleCount,
        fixedStartTimes,
        openTime,
        closeTime,
        timeBlocks,
        serviceArea
      )

      console.log(
        `[Availability] date=${date} service=${serviceSlug} people=${peopleCount}` +
        ` mode=${fixedResult.mode} slots=${fixedResult.slots.join(',') || 'none'}`
      )

      // isFullyBlocked=false with no slots → UI shows "no availability" (+ WhatsApp for groups)
      return NextResponse.json({
        availableSlots: fixedResult.slots,
        isFullyBlocked: false,
      })
    }

    // Areas without fixed times (e.g. mani/pedi, picnic) keep flexible slots
    const slotResult = findAllAvailableSlotsInActiveGroupWithMeta(
      date,
      eligibleRooms as Room[],
      roomBookings,
      serviceDurationMinutes,
      peopleCount,
      openTime,
      closeTime,
      timeBlocks,
      serviceArea
    )

    console.log(
      `[Availability] date=${date} service=${serviceSlug}` +
      ` activeBookings=${activeBookings.length} roomBookings=${roomBookings.length}` +
      ` slots=${slotResult.slots.length} group=${slotResult.activeGroup}`
    )

    return NextResponse.json({
      availableSlots: slotResult.slots,
      isFullyBlocked: false,
    })
  } catch (error) {
    console.error('[Availability] Error:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
