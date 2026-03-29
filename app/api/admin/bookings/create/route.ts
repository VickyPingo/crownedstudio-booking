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
      depositPaid,
      fullyPaid,
      selectedUpsellsByPerson,
      roomAssignments,
      isCustomBooking,
      customBookingName,
      customDurationMinutes,
      customPrice,
      adminUserId,
      adminName,
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
    const remainingBalance = Math.max(0, totalPrice - depositAmount)

    let bookingStatus = 'confirmed'
    if (paymentOption === 'no_payment') {
      bookingStatus = 'confirmed'
    } else if (fullyPaid === true) {
      bookingStatus = 'confirmed'
    } else if (depositPaid === true) {
      bookingStatus = 'confirmed'
    } else {
      bookingStatus = 'pending_payment'
    }

    const primaryRoomId =
      Array.isArray(roomAssignments) && roomAssignments.length > 0
        ? roomAssignments[0].roomId
        : null

    // IMPORTANT:
    // - deposit is represented by a completed payment transaction
    // - balance_paid stores the non-deposit portion already received
    // This prevents payment summary code from seeing "deposit paid" as R0,
    // and also avoids double-counting full manual payments.
    const depositWasPaid = paymentOption !== 'no_payment' && (depositPaid === true || fullyPaid === true)
    const balanceAlreadyPaid = fullyPaid === true ? remainingBalance : 0

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
        payment_method_manual:
          paymentOption !== 'no_payment' ? manualPaymentMethod || null : null,
        deposit_paid_manually: depositWasPaid,
        deposit_paid_at: depositWasPaid ? new Date().toISOString() : null,

        // only store the balance portion here, not the full amount
        balance_paid: balanceAlreadyPaid,
        balance_paid_at: balanceAlreadyPaid > 0 ? new Date().toISOString() : null,
        balance_paid_by: balanceAlreadyPaid > 0 ? adminUserId || null : null,
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

    // Create a completed manual payment transaction for the deposit portion.
    // This is what allows the UI/payment helper to see that the deposit was actually paid.
    if (depositWasPaid && depositAmount > 0) {
      const { error: paymentInsertError } = await supabaseAdmin
        .from('payment_transactions')
        .insert({
          booking_id: booking.id,
          status: 'complete',
          amount: depositAmount,
          payment_method: manualPaymentMethod || 'manual',
          created_at: new Date().toISOString(),
        })

      if (paymentInsertError) {
        console.error('[CreateBooking] Failed to create manual payment transaction:', paymentInsertError)
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
        payment_option: paymentOption || null,
        deposit_paid: depositWasPaid,
        fully_paid: fullyPaid === true,
        deposit_amount: depositAmount,
        balance_paid: balanceAlreadyPaid,
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
