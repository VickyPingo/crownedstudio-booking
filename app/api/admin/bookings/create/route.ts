import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { writeAuditLogServer } from '@/lib/auditLogServer'
import { assignRoomsToBooking, RoomAssignmentInput } from '@/lib/roomAllocation'

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json()

    const {
      customerId,
      serviceSlug,
      selectedDate,
      selectedTime,
      peopleCount,
      totalDuration,
      pricing,
      allergies,
      massagePressure,
      pressureByPerson,
      medicalHistory,
      internalNotes,
      voucherCode,
      voucherId,
      paymentOption,
      manualPaymentMethod,
      initialAmountPaid,
      roomAssignments,
      selectedUpsellsByPerson,
      isCustomBooking,
      customBookingName,
      customDurationMinutes,
      customPrice,
      adminUserId,
      adminName,
      selectedUpsellsByPerson,
    } = payload

    const safeNum = (val: unknown) =>
      typeof val === 'number' && !isNaN(val) ? val : Number(val) || 0

    if (!customerId || !selectedDate || !selectedTime || !totalDuration) {
      return NextResponse.json(
        { success: false, error: 'Missing required booking fields' },
        { status: 400 }
      )
    }

    if (!isCustomBooking && !serviceSlug) {
      return NextResponse.json(
        { success: false, error: 'Missing service slug for existing service booking' },
        { status: 400 }
      )
    }

    if (!Array.isArray(roomAssignments) || roomAssignments.length === 0) {
      return NextResponse.json(
        { success: false, error: 'At least one room assignment is required' },
        { status: 400 }
      )
    }

    const startDateTime = new Date(`${selectedDate}T${selectedTime}:00+02:00`)
    const endDateTime = new Date(startDateTime.getTime() + safeNum(totalDuration) * 60000)

    if (Number.isNaN(startDateTime.getTime()) || Number.isNaN(endDateTime.getTime())) {
      return NextResponse.json(
        { success: false, error: 'Invalid booking date/time' },
        { status: 400 }
      )
    }

    const totalPrice = safeNum(pricing?.total)
    const depositAmount = paymentOption === 'no_payment' ? 0 : safeNum(pricing?.deposit)
    const nowIso = new Date().toISOString()
    const initialPaidAmount =
      paymentOption === 'no_payment'
        ? 0
        : Math.max(0, Math.min(totalPrice, safeNum(initialAmountPaid)))

    const bookingStatus =
      paymentOption === 'no_payment' || initialPaidAmount > 0
        ? 'confirmed'
        : 'pending_payment'

    const primaryRoomId =
      Array.isArray(roomAssignments) && roomAssignments.length > 0
        ? roomAssignments[0].roomId
        : null

    const { data: booking, error: bookingError } = await supabaseAdmin
      .from('bookings')
      .insert({
        customer_id: customerId,
        service_slug: isCustomBooking ? null : serviceSlug || null,
        is_custom_booking: !!isCustomBooking,
        is_manual_booking: true,
        custom_booking_name: isCustomBooking ? customBookingName || null : null,
        custom_duration_minutes: isCustomBooking ? safeNum(customDurationMinutes) : null,
        custom_price: isCustomBooking ? safeNum(customPrice) : null,

        start_time: startDateTime.toISOString(),
        end_time: endDateTime.toISOString(),

        total_price: totalPrice,
        base_price: safeNum(pricing?.basePrice),
        upsells_total: safeNum(pricing?.upsellsTotal),
        discount_amount: safeNum(pricing?.discount),
        discount_type: null,
        voucher_code: voucherCode || null,
        voucher_id: voucherId || null,

        status: bookingStatus,
        people_count: safeNum(peopleCount),
        room_id: primaryRoomId,

        allergies: allergies || null,
        massage_pressure: massagePressure || null,
        pressure_preferences:
          pressureByPerson && Object.keys(pressureByPerson).length > 0
            ? pressureByPerson
            : null,
        medical_history: medicalHistory || null,
        internal_notes: internalNotes || null,

        deposit_due: depositAmount,
no_payment_required: paymentOption === 'no_payment',
payment_method_manual: paymentOption !== 'no_payment' ? manualPaymentMethod || null : null,
deposit_paid_manually: initialPaidAmount >= depositAmount && depositAmount > 0,
deposit_paid_at: initialPaidAmount > 0 ? nowIso : null,

// Fallback source of truth for manual/custom bookings.
// This ensures the booking still reflects money received even if
// payment_transactions insert fails for any reason.
balance_paid: initialPaidAmount > 0 ? initialPaidAmount : 0,
balance_paid_at: initialPaidAmount > 0 ? nowIso : null,
balance_paid_by: initialPaidAmount > 0 ? adminUserId || null : null,
      })
      .select()
      .single()

    if (bookingError || !booking) {
      console.error('[CreateBooking] Booking insert failed:', bookingError)
      return NextResponse.json(
        { success: false, error: 'Failed to create booking' },
        { status: 500 }
      )
    }

// ✅ INSERT UPSELLS FOR MANUAL BOOKINGS
if (selectedUpsellsByPerson && typeof selectedUpsellsByPerson === 'object') {
  const allUpsellIds = [
  ...new Set(
    Object.values(selectedUpsellsByPerson).flatMap((ids) => ids as string[])
  ),
]
  if (allUpsellIds.length > 0) {
    const { data: upsells } = await supabaseAdmin
      .from('upsells')
      .select('id, price, duration_added_minutes')
      .in('id', allUpsellIds)

    if (upsells && upsells.length > 0) {
      const upsellMap = new Map(upsells.map(u => [u.id, u]))

      const bookingUpsells: any[] = []

      for (const [personKey, ids] of Object.entries(selectedUpsellsByPerson as Record<string, string[]>)) {
        const personNumber = parseInt(personKey, 10)

        for (const upsellId of ids as string[]) {
          const upsell = upsellMap.get(upsellId)
          if (upsell) {
            bookingUpsells.push({
              booking_id: booking.id,
              upsell_id: upsell.id,
              quantity: 1,
              price_total: upsell.price,
              duration_added_minutes: upsell.duration_added_minutes,
              person_number: personNumber,
            })
          }
        }
      }

      if (bookingUpsells.length > 0) {
        const { error } = await supabaseAdmin
          .from('booking_upsells')
          .insert(bookingUpsells)

        if (error) {
          console.error('[ManualBooking] Upsell insert failed:', error)
        }
      }
    }
  }
}
    
    // Create a single real manual payment transaction for any amount already paid
    if (initialPaidAmount > 0) {
      const paymentTxId = `MANUAL-PAY-${booking.id.replace(/-/g, '')}-${Date.now()}`

      const { error: paymentTxError } = await supabaseAdmin
        .from('payment_transactions')
        .insert({
          booking_id: booking.id,
          merchant_transaction_id: paymentTxId,
          item_name: 'Manual Payment',
          status: 'complete',
          amount: initialPaidAmount,
          payment_method: manualPaymentMethod || 'manual',
          created_at: nowIso,
        })

      if (paymentTxError) {
  console.error('[CreateBooking] Manual payment transaction insert failed:', paymentTxError)
  // Do NOT fail the whole booking at this point.
  // The booking already exists, and balance_paid now stores the amount received.
}
    }

    const explicitAssignments: RoomAssignmentInput[] = roomAssignments.map(
      (ra: { roomId: string; people: number }) => ({
        roomId: ra.roomId,
        people: ra.people,
      })
    )

    const assignResult = await assignRoomsToBooking(
      booking.id,
      explicitAssignments.map((ra) => ra.roomId),
      explicitAssignments
    ).catch((err) => {
      console.error('[CreateBooking] assignRoomsToBooking threw:', err)
      return { success: false, error: String(err) }
    })

    if (!assignResult.success) {
      console.error('[CreateBooking] assignRoomsToBooking failed:', assignResult.error)
    }

    const hasPerPersonUpsells =
      selectedUpsellsByPerson &&
      Object.values(selectedUpsellsByPerson).some(
        (arr) => Array.isArray(arr) && arr.length > 0
      )

    if (hasPerPersonUpsells) {
      const allUpsellIds = [
        ...new Set(
          Object.values(selectedUpsellsByPerson).flat().filter((id) => typeof id === 'string')
        ),
      ]

      if (allUpsellIds.length > 0) {
        const { data: upsellData, error: upsellQueryError } = await supabaseAdmin
          .from('upsells')
          .select('id, price, duration_added_minutes')
          .in('id', allUpsellIds)

        if (upsellQueryError) {
          console.error('[CreateBooking] Upsells query error:', upsellQueryError)
        }

        if (upsellData && upsellData.length > 0) {
          const upsellMap = new Map(upsellData.map((u) => [u.id, u]))
          const bookingUpsells: Array<{
            booking_id: string
            upsell_id: string
            quantity: number
            price_total: number
            duration_added_minutes: number
            person_number: number
          }> = []

          for (const [personKey, personUpsellIds] of Object.entries(selectedUpsellsByPerson)) {
            const personNumber = Number(personKey)
            if (!Array.isArray(personUpsellIds)) continue
            for (const upsellId of personUpsellIds) {
              const upsell = upsellMap.get(upsellId)
              if (upsell) {
                bookingUpsells.push({
                  booking_id: booking.id,
                  upsell_id: upsell.id,
                  quantity: 1,
                  price_total: upsell.price,
                  duration_added_minutes: upsell.duration_added_minutes,
                  person_number: personNumber,
                })
              }
            }
          }

          if (bookingUpsells.length > 0) {
            const { error: bookingUpsellsInsertError } = await supabaseAdmin
              .from('booking_upsells')
              .insert(bookingUpsells)

            if (bookingUpsellsInsertError) {
              console.error('[CreateBooking] booking_upsells insert error:', bookingUpsellsInsertError)
            }
          }
        }
      }
    }

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
        deposit_due: depositAmount,
        initial_amount_paid: initialPaidAmount,
        deposit_paid: initialPaidAmount >= depositAmount && depositAmount > 0,
        fully_paid: initialPaidAmount >= totalPrice && totalPrice > 0,
        status: bookingStatus,
        rooms: roomAssignments.map((ra: { roomId: string; people: number }) => ({
          roomId: ra.roomId,
          people: ra.people,
        })),
      },
      {
        adminId: adminUserId || null,
        adminName: adminName || null,
      }
    )

    return NextResponse.json({ success: true, bookingId: booking.id })
  } catch (err) {
    console.error('[CreateBooking] Unexpected error:', err)
    return NextResponse.json(
      { success: false, error: 'Failed to create booking' },
      { status: 500 }
    )
  }
}
