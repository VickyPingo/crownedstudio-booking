import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { writeAuditLogServer } from '@/lib/auditLogServer'

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json()

    const {
      customerId,
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

      // 👇 IMPORTANT
      adminUserId,
      adminName,
    } = payload

    const safeNum = (val: unknown) =>
      typeof val === 'number' && !isNaN(val) ? val : 0

    const totalPrice = safeNum(pricing?.total)

    let bookingStatus = 'confirmed'

    if (paymentOption === 'no_payment') {
      bookingStatus = 'confirmed'
    }

    // -------------------------
    // CREATE BOOKING
    // -------------------------
    const { data: booking, error: bookingError } = await supabaseAdmin
      .from('bookings')
      .insert({
        customer_id: customerId,
        start_time: selectedDate,
        end_time: selectedDate,
        total_price: totalPrice,
        base_price: safeNum(pricing?.basePrice),
        upsells_total: safeNum(pricing?.upsellsTotal),
        discount_amount: safeNum(pricing?.discount),
        discount_type: null,
        voucher_code: voucherCode || null,
        voucher_id: voucherId || null,
        status: bookingStatus,
        people_count: safeNum(peopleCount),
        allergies,
        massage_pressure: massagePressure,
        medical_history: medicalHistory,
        internal_notes: internalNotes || null,
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

    // -------------------------
    // ASSIGN ROOMS
    // -------------------------
    if (Array.isArray(roomAssignments) && roomAssignments.length > 0) {
      const roomRows = roomAssignments.map((ra: any) => ({
        booking_id: booking.id,
        room_id: ra.roomId,
        people: ra.people,
      }))

      const { error: roomError } = await supabaseAdmin
        .from('booking_rooms')
        .insert(roomRows)

      if (roomError) {
        console.error('[CreateBooking] Room assignment failed:', roomError)
      }
    }

    // -------------------------
    // SAVE PRESSURE PER PERSON
    // -------------------------
    if (pressureByPerson) {
      const rows = Object.entries(pressureByPerson).map(([index, pressure]) => ({
        booking_id: booking.id,
        person_index: Number(index),
        pressure,
      }))

      if (rows.length > 0) {
        await supabaseAdmin.from('pressure_preferences').insert(rows)
      }
    }

    // -------------------------
    // AUDIT LOG (FIXED)
    // -------------------------
    await writeAuditLogServer(
      booking.id,
      'booking_created',
      {
        booking_type: isCustomBooking ? 'custom' : 'existing_service',
        service: isCustomBooking ? customBookingName : 'service',
        people_count: safeNum(peopleCount),
        date: selectedDate,
        time: selectedTime,
        total_price: totalPrice,
        status: bookingStatus,
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
