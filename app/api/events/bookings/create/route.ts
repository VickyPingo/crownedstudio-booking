import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { CreateEventBookingPayload } from '@/types/event'

export async function POST(request: NextRequest) {
  try {
    const supabase = supabaseAdmin
    const payload: CreateEventBookingPayload = await request.json()

    const {
      eventSlug,
      bookerName,
      bookerEmail,
      bookerPhone,
      quantity,
      voucherCode,
      voucherDiscount = 0,
    } = payload

    if (!eventSlug || !bookerName || !bookerEmail || !bookerPhone || !quantity) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('*')
      .eq('slug', eventSlug)
      .eq('is_active', true)
      .maybeSingle()

    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    let customerId: string | null = null
    const { data: existingCustomer } = await supabase
      .from('customers')
      .select('id')
      .eq('email', bookerEmail.toLowerCase())
      .maybeSingle()

    if (existingCustomer) {
      customerId = existingCustomer.id
    } else {
      const { data: newCustomer } = await supabase
        .from('customers')
        .insert({
          full_name: bookerName,
          email: bookerEmail.toLowerCase(),
          phone: bookerPhone,
        })
        .select('id')
        .maybeSingle()

      if (newCustomer) {
        customerId = newCustomer.id
      }
    }

    const pricePerPerson = event.price_per_person
    const subtotalAmount = pricePerPerson * quantity
    const totalAmount = Math.max(0, subtotalAmount - voucherDiscount)

    const { data: booking, error: bookingError } = await supabase
      .from('event_bookings')
      .insert({
        event_id: event.id,
        customer_id: customerId,
        booker_name: bookerName,
        booker_email: bookerEmail.toLowerCase(),
        booker_phone: bookerPhone,
        quantity,
        price_per_person: pricePerPerson,
        subtotal_amount: subtotalAmount,
        voucher_code: voucherCode || null,
        voucher_discount: voucherDiscount,
        total_amount: totalAmount,
        payment_status: totalAmount === 0 ? 'paid' : 'pending',
        booking_status: totalAmount === 0 ? 'confirmed' : 'pending',
      })
      .select('*')
      .single()

    if (bookingError) {
      console.error('Event booking creation error:', bookingError)
      return NextResponse.json({ error: 'Failed to create booking' }, { status: 500 })
    }

    if (voucherCode) {
      await supabase.rpc('increment_voucher_usage', { voucher_code: voucherCode })
    }

    return NextResponse.json({
      success: true,
      booking: {
        id: booking.id,
        eventId: booking.event_id,
        eventTitle: event.title,
        quantity: booking.quantity,
        subtotalAmount: booking.subtotal_amount,
        voucherDiscount: booking.voucher_discount,
        totalAmount: booking.total_amount,
        paymentStatus: booking.payment_status,
        bookingStatus: booking.booking_status,
      },
    })
  } catch (error) {
    console.error('Event booking API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
