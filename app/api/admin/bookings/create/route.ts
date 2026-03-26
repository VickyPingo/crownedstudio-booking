import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { allocateRoom, assignRoomsToBooking, getBlockingTimeBlock, RoomAssignmentInput } from '@/lib/roomAllocation'
import { writeAuditLogServer } from '@/lib/auditLogServer'

const safeNum = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

export async function POST(request: NextRequest) {
  try {
    const supabase = supabaseAdmin
    const payload = await request.json()

    console.log('[AdminBookingCreate] incoming payload:', JSON.stringify(payload))

    const {
      customerId,
      serviceSlug,
      isCustomBooking,
      customBookingName,
      customDurationMinutes,
      customPrice,
      peopleCount,
      selectedDate,
      selectedTime,
      totalDuration,
      pricing,
      allergies,
      massagePressure,
      medicalHistory,
      internalNotes,
      voucherCode,
      voucherId,
      paymentOption,
      manualPaymentMethod,
      depositPaid,
      fullyPaid,
      selectedUpsellsByPerson,
      // New: explicit room assignments from admin UI (array of { roomId, people })
      roomAssignments,
      // Legacy fallback — kept for backward compat with any direct API callers
      prefillRoomId,
    } = payload
const adminUserId: string | null = payload.adminUserId || null
const adminName: string | null = payload.adminName || null
    const explicitRoomIds: string[] = Array.isArray(roomAssignments) && roomAssignments.length > 0
      ? roomAssignments.map((ra: { roomId: string }) => ra.roomId)
      : prefillRoomId ? [prefillRoomId] : []

    const safeDuration = safeNum(totalDuration)

    if (isCustomBooking && (!customBookingName?.trim() || !customDurationMinutes)) {
      return NextResponse.json({ error: 'Custom bookings require a name and duration' }, { status: 400 })
    }

    if (!isCustomBooking && !serviceSlug) {
      return NextResponse.json({ error: 'Service slug is required for existing service bookings' }, { status: 400 })
    }

    const effectiveDuration = safeDuration

    if (!selectedDate || !selectedTime || effectiveDuration <= 0) {
      console.error('[AdminBookingCreate] Invalid booking data:', { selectedDate, selectedTime, effectiveDuration })
      return NextResponse.json({ error: 'Invalid booking data: missing date, time, or duration' }, { status: 400 })
    }

    const startDateTime = new Date(`${selectedDate}T${selectedTime}:00+02:00`)
    const endDateTime = new Date(startDateTime.getTime() + effectiveDuration * 60000)

    if (Number.isNaN(startDateTime.getTime()) || Number.isNaN(endDateTime.getTime())) {
      console.error('[AdminBookingCreate] Invalid date/time:', { selectedDate, selectedTime })
      return NextResponse.json({ error: 'Invalid booking date/time' }, { status: 400 })
    }

    let serviceArea = 'treatment'
    if (!isCustomBooking && serviceSlug) {
      const { data: serviceData } = await supabase
        .from('services')
        .select('service_area')
        .eq('slug', serviceSlug)
        .maybeSingle()
      serviceArea = serviceData?.service_area || 'treatment'
    }

    let roomAllocation: { room_ids: string[]; room_names: string[]; error?: string }

    if (explicitRoomIds.length > 0) {
      // Admin has explicitly chosen rooms — validate each one without falling back to auto-allocation
      const room_ids: string[] = []
      const room_names: string[] = []

      for (const roomId of explicitRoomIds) {
        const { data: roomRow } = await supabase
          .from('rooms')
          .select('room_name, room_area, capacity, active')
          .eq('id', roomId)
          .maybeSingle()

        if (!roomRow || !roomRow.active) {
          return NextResponse.json(
            { error: `Room ${roomId} not found or inactive` },
            { status: 409 }
          )
        }

        // Check for conflicting time blocks
        const blockingBlock = await getBlockingTimeBlock(roomId, startDateTime, endDateTime)
        if (blockingBlock) {
          const blockDesc = blockingBlock.is_full_day
            ? 'all day'
            : `${blockingBlock.start_time?.slice(0, 5)} to ${blockingBlock.end_time?.slice(0, 5)}`
          console.error(
            `[AdminBookingCreate] Rejected — room "${roomRow.room_name}" blocked ${blockDesc} id=${blockingBlock.id}`
          )
          return NextResponse.json(
            { error: `Room "${roomRow.room_name}" is blocked ${blockDesc} and cannot be booked during this time` },
            { status: 409 }
          )
        }

        // Check for conflicting bookings
        const { checkRoomAvailability } = await import('@/lib/roomAllocation')
        const isAvailable = await checkRoomAvailability(roomId, startDateTime, endDateTime)
        if (!isAvailable) {
          console.error(
            `[AdminBookingCreate] Rejected — room "${roomRow.room_name}" has conflicting booking` +
            ` | requested ${startDateTime.toISOString()} – ${endDateTime.toISOString()}`
          )
          return NextResponse.json(
            { error: `Room "${roomRow.room_name}" is not available for the selected time slot` },
            { status: 409 }
          )
        }

        room_ids.push(roomId)
        room_names.push(roomRow.room_name)
        console.log(`[AdminBookingCreate] Admin-assigned room accepted: "${roomRow.room_name}"`)
      }

      roomAllocation = { room_ids, room_names }
    } else {
      // No explicit rooms — use auto-allocation based on service area
      try {
        roomAllocation = await allocateRoom(serviceArea, startDateTime, endDateTime, safeNum(peopleCount))
      } catch (err) {
        console.error('[AdminBookingCreate] Room allocation error:', err)
        return NextResponse.json({ error: 'Room allocation failed' }, { status: 500 })
      }

      if (roomAllocation.error || roomAllocation.room_ids.length === 0) {
        return NextResponse.json(
          { error: roomAllocation.error || 'No rooms available for this time slot' },
          { status: 409 }
        )
      }

      // Defensive guard for auto-allocated rooms
      for (const roomId of roomAllocation.room_ids) {
        const blockingBlock = await getBlockingTimeBlock(roomId, startDateTime, endDateTime)
        if (blockingBlock) {
          const blockDesc = blockingBlock.is_full_day
            ? 'all day'
            : `${blockingBlock.start_time?.slice(0, 5)} to ${blockingBlock.end_time?.slice(0, 5)}`
          console.error(
            `[AdminBookingCreate] Rejected — room ${roomId} is blocked by time block id=${blockingBlock.id}` +
            ` (${blockingBlock.room_id ? 'room-specific' : 'global'}) ${blockDesc}` +
            ` | requested ${startDateTime.toISOString()} – ${endDateTime.toISOString()}`
          )
          return NextResponse.json(
            { error: `Room is blocked from ${blockDesc} and cannot be booked during this time` },
            { status: 409 }
          )
        }
      }
    }

    if (roomAllocation.room_ids.length === 0) {
      return NextResponse.json(
        { error: roomAllocation.error || 'No rooms available for this time slot' },
        { status: 409 }
      )
    }

    const { data: { user } } = await supabase.auth.getUser()
    const adminUserId: string | null = user?.id ?? null

    let bookingStatus = 'confirmed'
    if (paymentOption === 'no_payment') {
      bookingStatus = 'confirmed'
    } else if (fullyPaid === true) {
      bookingStatus = 'confirmed'
    } else if (depositPaid === true && paymentOption === 'deposit_required') {
      bookingStatus = 'confirmed'
    }

    console.log('[AdminBookingCreate] bookingStatus:', bookingStatus, '| paymentOption:', paymentOption, '| depositPaid:', depositPaid, '| fullyPaid:', fullyPaid)

    const isNoPayment = paymentOption === 'no_payment'
    const totalPrice = safeNum(pricing?.total)

    const insertPayload = {
      customer_id: customerId,
      service_slug: isCustomBooking ? null : serviceSlug,
      is_custom_booking: isCustomBooking === true,
      custom_booking_name: isCustomBooking ? (customBookingName?.trim() || null) : null,
      custom_duration_minutes: isCustomBooking ? safeNum(customDurationMinutes) : null,
      custom_price: isCustomBooking ? safeNum(customPrice) : null,
      people_count: safeNum(peopleCount),
      status: bookingStatus,
      start_time: startDateTime.toISOString(),
      end_time: endDateTime.toISOString(),
      base_price: isCustomBooking ? safeNum(customPrice) : safeNum(pricing?.basePrice),
      weekend_surcharge_amount: safeNum(pricing?.surcharge),
      upsells_total: safeNum(pricing?.upsellsTotal),
      discount_amount: safeNum(pricing?.discount),
      discount_type: voucherId ? 'voucher' : null,
      total_price: totalPrice,
      deposit_due: isNoPayment ? 0 : safeNum(pricing?.deposit),
      allergies: allergies || null,
      massage_pressure: massagePressure || null,
      medical_history: medicalHistory || null,
      internal_notes: internalNotes || null,
      voucher_code: voucherCode || null,
      voucher_id: voucherId || null,
      voucher_discount: safeNum(pricing?.discount),
      is_manual_booking: true,
      created_by_admin: adminUserId,
      no_payment_required: isNoPayment,
      payment_method_manual: !isNoPayment ? (manualPaymentMethod || null) : null,
      deposit_paid_manually: depositPaid === true,
      deposit_paid_at: depositPaid === true ? new Date().toISOString() : null,
      balance_paid: fullyPaid === true ? totalPrice : 0,
      balance_paid_at: fullyPaid === true ? new Date().toISOString() : null,
      balance_paid_by: fullyPaid === true ? adminUserId : null,
      room_id: roomAllocation.room_ids[0] || null,
      terms_accepted: true,
      terms_accepted_at: new Date().toISOString(),
    }

    console.log('[AdminBookingCreate] insert payload:', JSON.stringify(insertPayload))

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .insert(insertPayload)
      .select('id')
      .single()

    if (bookingError || !booking) {
      console.error('[AdminBookingCreate] Booking error full:', {
        message: bookingError?.message,
        details: bookingError?.details,
        hint: bookingError?.hint,
        code: bookingError?.code,
        bookingError,
      })
      return NextResponse.json(
        { error: 'Failed to create booking', details: bookingError?.message },
        { status: 500 }
      )
    }

    console.log('[AdminBookingCreate] Booking created:', booking.id)
await writeAuditLogServer(
  booking.id,
  'booking_created',
  {
    booking_type: isCustomBooking ? 'custom' : 'existing_service',
    service: isCustomBooking ? customBookingName : serviceSlug,
    people_count: safeNum(peopleCount),
    date: selectedDate,
    time: selectedTime,
    total_price: totalPrice,
    status: bookingStatus,
    rooms: roomAllocation.room_names,
    payment_option: paymentOption,
  },
  {
    adminId: adminUserId,
    adminName: adminName || null,
  }
)
    const explicitAssignments: RoomAssignmentInput[] | undefined =
      Array.isArray(roomAssignments) && roomAssignments.length > 0
        ? roomAssignments.map((ra: { roomId: string; people: number }) => ({ roomId: ra.roomId, people: ra.people }))
        : undefined

    const assignResult = await assignRoomsToBooking(booking.id, roomAllocation.room_ids, explicitAssignments).catch((err) => {
      console.error('[AdminBookingCreate] assignRoomsToBooking threw:', err)
      return { success: false, error: String(err) }
    })
    if (!assignResult.success) {
      console.error('[AdminBookingCreate] assignRoomsToBooking failed:', assignResult.error)
    }

    if (selectedUpsellsByPerson && Object.keys(selectedUpsellsByPerson).length > 0) {
      const allUpsellSlugs = [...new Set(Object.values(selectedUpsellsByPerson).flat())] as string[]
      if (allUpsellSlugs.length > 0) {
        const { data: upsellData, error: upsellFetchError } = await supabase
          .from('upsells')
          .select('id, slug, price, duration_added_minutes')
          .in('slug', allUpsellSlugs)

        if (upsellFetchError) {
          console.error('[AdminBookingCreate] upsells fetch error:', upsellFetchError)
        }

        if (upsellData) {
          const upsellMap = new Map(upsellData.map((u: any) => [u.slug, u]))
          const bookingUpsells: {
            booking_id: string
            upsell_id: string
            quantity: number
            price_total: number
            duration_added_minutes: number
            person_number: number
          }[] = []

          for (const [personKey, slugs] of Object.entries(selectedUpsellsByPerson)) {
            const personNum = parseInt(personKey, 10)
            if (!Number.isFinite(personNum)) continue
            for (const slug of slugs as string[]) {
              const upsell = upsellMap.get(slug)
              if (upsell) {
                bookingUpsells.push({
                  booking_id: booking.id,
                  upsell_id: upsell.id,
                  quantity: 1,
                  price_total: safeNum(upsell.price),
                  duration_added_minutes: safeNum(upsell.duration_added_minutes),
                  person_number: personNum,
                })
              }
            }
          }

          if (bookingUpsells.length > 0) {
            const { error: upsellInsertError } = await supabase.from('booking_upsells').insert(bookingUpsells)
            if (upsellInsertError) {
              console.error('[AdminBookingCreate] booking_upsells insert error:', upsellInsertError)
            }
          }
        }
      }
    }

    if (voucherId) {
      const { error: voucherUsageError } = await supabase.from('voucher_usage').insert({
        voucher_id: voucherId,
        booking_id: booking.id,
        discount_applied: safeNum(pricing?.discount),
      })
      if (voucherUsageError) {
        console.error('[AdminBookingCreate] voucher_usage insert error:', voucherUsageError)
      }

      const { error: rpcError } = await supabase.rpc('increment_voucher_usage', { voucher_id: voucherId })
      if (rpcError) {
        console.error('[AdminBookingCreate] increment_voucher_usage rpc error:', rpcError)
      }
    }

    if ((depositPaid === true || fullyPaid === true) && paymentOption !== 'no_payment') {
      const txAmount = fullyPaid === true ? safeNum(pricing?.total) : safeNum(pricing?.deposit)
      const { error: txError } = await supabase.from('payment_transactions').insert({
        booking_id: booking.id,
        merchant_transaction_id: `MANUAL-${booking.id.slice(0, 8)}-${Date.now()}`,
        status: 'complete',
        amount: txAmount,
        payment_method: manualPaymentMethod || null,
        item_name: isCustomBooking ? `Manual booking - ${customBookingName}` : `Manual booking - ${serviceSlug}`,
      })
      if (txError) {
        console.error('[AdminBookingCreate] payment_transactions insert error:', txError)
      }
    }

    return NextResponse.json({
      success: true,
      bookingId: booking.id,
    })
  } catch (error) {
    console.error('[AdminBookingCreate] Unhandled error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
