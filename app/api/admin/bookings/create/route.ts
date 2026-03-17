import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { allocateRoom } from '@/lib/roomAllocation'
import { isSameDayBooking } from '@/lib/timeSlots'

export async function POST(request: NextRequest) {
  try {
    const supabase = supabaseAdmin
    const payload = await request.json()

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
    } = payload

    if (isSameDayBooking(selectedDate)) {
      return NextResponse.json(
        { error: 'Same-day bookings are not allowed. Please choose a date from tomorrow onward.' },
        { status: 400 }
      )
    }

    const startDateTime = new Date(`${selectedDate}T${selectedTime}:00+02:00`)
    const endDateTime = new Date(startDateTime.getTime() + totalDuration * 60000)

    const { data: serviceData } = await supabase
      .from('services')
      .select('service_area')
      .eq('slug', serviceSlug)
      .maybeSingle()

    const serviceArea = serviceData?.service_area || 'treatment'

    let roomAllocation: { room_id: string | null; room_name: string | null; error?: string }
    try {
      roomAllocation = await allocateRoom(
        serviceArea,
        startDateTime,
        endDateTime,
        peopleCount
      )
    } catch (err) {
      console.error('Room allocation error:', err)
      return NextResponse.json(
        { error: 'Room allocation failed' },
        { status: 500 }
      )
    }

    if (roomAllocation.error || !roomAllocation.room_id) {
      return NextResponse.json(
        { error: roomAllocation.error || 'No rooms available for this time slot' },
        { status: 409 }
      )
    }

    const { data: { user } } = await supabase.auth.getUser()

    let bookingStatus = 'pending_payment'
    if (paymentOption === 'no_payment') {
      bookingStatus = 'confirmed'
    } else if (fullyPaid || (depositPaid && paymentOption === 'deposit_required')) {
      bookingStatus = 'confirmed'
    }

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .insert({
        customer_id: customerId,
        service_slug: serviceSlug,
        people_count: peopleCount,
        status: bookingStatus,
        start_time: startDateTime.toISOString(),
        end_time: endDateTime.toISOString(),
        base_price: pricing.basePrice,
        surcharge_total: pricing.surcharge,
        upsells_total: pricing.upsellsTotal,
        discount_amount: pricing.discount,
        discount_type: voucherId ? 'voucher' : null,
        total_price: pricing.total,
        deposit_due: pricing.deposit,
        allergies: allergies || null,
        massage_pressure: massagePressure,
        medical_history: medicalHistory || null,
        internal_notes: internalNotes || null,
        voucher_code: voucherCode || null,
        voucher_id: voucherId || null,
        voucher_discount: pricing.discount,
        is_manual_booking: true,
        created_by_admin: user?.id || null,
        payment_method_manual: paymentOption !== 'no_payment' ? manualPaymentMethod : null,
        deposit_paid_manually: depositPaid,
        deposit_paid_at: depositPaid ? new Date().toISOString() : null,
        balance_paid: fullyPaid ? pricing.total : depositPaid ? pricing.deposit : 0,
        balance_paid_at: fullyPaid || depositPaid ? new Date().toISOString() : null,
        balance_paid_by: fullyPaid || depositPaid ? user?.id : null,
        room_id: roomAllocation.room_id,
      })
      .select('id')
      .single()

    if (bookingError || !booking) {
      console.error('Booking error:', bookingError)
      return NextResponse.json(
        { error: 'Failed to create booking' },
        { status: 500 }
      )
    }

    if (selectedUpsellsByPerson && Object.keys(selectedUpsellsByPerson).length > 0) {
      const allUpsellSlugs = [...new Set(Object.values(selectedUpsellsByPerson).flat())]
      if (allUpsellSlugs.length > 0) {
        const { data: upsellData } = await supabase
          .from('upsells')
          .select('id, slug, price, duration_added_minutes')
          .in('slug', allUpsellSlugs)

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
            for (const slug of slugs as string[]) {
              const upsell = upsellMap.get(slug)
              if (upsell) {
                bookingUpsells.push({
                  booking_id: booking.id,
                  upsell_id: upsell.id,
                  quantity: 1,
                  price_total: upsell.price,
                  duration_added_minutes: upsell.duration_added_minutes,
                  person_number: personNum,
                })
              }
            }
          }

          if (bookingUpsells.length > 0) {
            await supabase.from('booking_upsells').insert(bookingUpsells)
          }
        }
      }
    }

    if (voucherId) {
      await supabase.from('voucher_usage').insert({
        voucher_id: voucherId,
        booking_id: booking.id,
        discount_applied: pricing.discount,
      })

      await supabase.rpc('increment_voucher_usage', { voucher_id: voucherId })
    }

    if ((depositPaid || fullyPaid) && paymentOption !== 'no_payment') {
      await supabase.from('payment_transactions').insert({
        booking_id: booking.id,
        merchant_transaction_id: `MANUAL-${booking.id.slice(0, 8)}-${Date.now()}`,
        status: 'complete',
        amount: fullyPaid ? pricing.total : pricing.deposit,
        payment_method: manualPaymentMethod,
        item_name: `Manual booking - ${serviceSlug}`,
      })
    }

    return NextResponse.json({
      success: true,
      bookingId: booking.id,
    })
  } catch (error) {
    console.error('Manual booking API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
