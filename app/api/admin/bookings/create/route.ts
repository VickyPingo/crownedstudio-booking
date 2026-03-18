import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { allocateRoom, assignRoomsToBooking } from '@/lib/roomAllocation'

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
      prefillRoomId,
    } = payload

    const safeDuration = safeNum(totalDuration)

    if (!selectedDate || !selectedTime || safeDuration <= 0) {
      console.error('[AdminBookingCreate] Invalid booking data:', { selectedDate, selectedTime, safeDuration })
      return NextResponse.json({ error: 'Invalid booking data: missing date, time, or duration' }, { status: 400 })
    }

    const startDateTime = new Date(`${selectedDate}T${selectedTime}:00+02:00`)
    const endDateTime = new Date(startDateTime.getTime() + safeDuration * 60000)

    if (Number.isNaN(startDateTime.getTime()) || Number.isNaN(endDateTime.getTime())) {
      console.error('[AdminBookingCreate] Invalid date/time:', { selectedDate, selectedTime })
      return NextResponse.json({ error: 'Invalid booking date/time' }, { status: 400 })
    }

    const { data: serviceData } = await supabase
      .from('services')
      .select('service_area')
      .eq('slug', serviceSlug)
      .maybeSingle()

    const serviceArea = serviceData?.service_area || 'treatment'

    let roomAllocation: { room_ids: string[]; room_names: string[]; error?: string }

    if (prefillRoomId) {
      const { checkRoomAvailability } = await import('@/lib/roomAllocation')

      const { data: prefillRoomRow } = await supabase
        .from('rooms')
        .select('room_name, room_area, capacity, active')
        .eq('id', prefillRoomId)
        .maybeSingle()

      console.log('[AdminBookingCreate] prefillRoomId:', prefillRoomId, '| room record:', prefillRoomRow, '| resolved serviceArea:', serviceArea)

      const isAvailable = await checkRoomAvailability(prefillRoomId, startDateTime, endDateTime)

      console.log('[AdminBookingCreate] checkRoomAvailability result for', prefillRoomRow?.room_name ?? prefillRoomId, ':', isAvailable)

      if (isAvailable) {
        roomAllocation = {
          room_ids: [prefillRoomId],
          room_names: [prefillRoomRow?.room_name || ''],
        }
        console.log('[AdminBookingCreate] Using prefill room:', prefillRoomRow?.room_name ?? prefillRoomId)
      } else {
        console.error(
          '[AdminBookingCreate] Prefill room', prefillRoomRow?.room_name ?? prefillRoomId,
          'is not available for', startDateTime.toISOString(), '–', endDateTime.toISOString(),
          '| NOT falling back to auto-allocation — returning conflict error'
        )
        return NextResponse.json(
          { error: `Room "${prefillRoomRow?.room_name ?? prefillRoomId}" is not available for the selected time slot` },
          { status: 409 }
        )
      }
    } else {
      try {
        roomAllocation = await allocateRoom(serviceArea, startDateTime, endDateTime, safeNum(peopleCount))
      } catch (err) {
        console.error('[AdminBookingCreate] Room allocation error:', err)
        return NextResponse.json({ error: 'Room allocation failed' }, { status: 500 })
      }
    }

    if (roomAllocation.error || roomAllocation.room_ids.length === 0) {
      return NextResponse.json(
        { error: roomAllocation.error || 'No rooms available for this time slot' },
        { status: 409 }
      )
    }

    const { data: { user } } = await supabase.auth.getUser()
    const adminUserId: string | null = user?.id ?? null

    let bookingStatus = 'pending_payment'
    if (paymentOption === 'no_payment') {
      bookingStatus = 'confirmed'
    } else if (fullyPaid === true) {
      bookingStatus = 'confirmed'
    } else if (depositPaid === true && paymentOption === 'deposit_required') {
      bookingStatus = 'confirmed'
    }

    const insertPayload = {
      customer_id: customerId,
      service_slug: serviceSlug,
      people_count: safeNum(peopleCount),
      status: bookingStatus,
      start_time: startDateTime.toISOString(),
      end_time: endDateTime.toISOString(),
      base_price: safeNum(pricing?.basePrice),
      weekend_surcharge_amount: safeNum(pricing?.surcharge),
      upsells_total: safeNum(pricing?.upsellsTotal),
      discount_amount: safeNum(pricing?.discount),
      discount_type: voucherId ? 'voucher' : null,
      total_price: safeNum(pricing?.total),
      deposit_due: safeNum(pricing?.deposit),
      allergies: allergies || null,
      massage_pressure: massagePressure || null,
      medical_history: medicalHistory || null,
      internal_notes: internalNotes || null,
      voucher_code: voucherCode || null,
      voucher_id: voucherId || null,
      voucher_discount: safeNum(pricing?.discount),
      is_manual_booking: true,
      created_by_admin: adminUserId,
      payment_method_manual: paymentOption !== 'no_payment' ? (manualPaymentMethod || null) : null,
      deposit_paid_manually: depositPaid === true,
      deposit_paid_at: depositPaid === true ? new Date().toISOString() : null,
      balance_paid: fullyPaid === true ? safeNum(pricing?.total) : 0,
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

    const assignResult = await assignRoomsToBooking(booking.id, roomAllocation.room_ids).catch((err) => {
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
        item_name: `Manual booking - ${serviceSlug}`,
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
