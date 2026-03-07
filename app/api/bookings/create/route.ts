import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { CreateBookingPayload } from '@/types/booking'

export async function POST(request: NextRequest) {
  try {
    const supabase = supabaseAdmin
    const payload: CreateBookingPayload = await request.json()

    let customerId: string

    const { data: existingCustomer } = await supabase
      .from('customers')
      .select('id')
      .eq('email', payload.customerEmail)
      .maybeSingle()

    if (existingCustomer) {
      customerId = existingCustomer.id
    } else {
      const { data: newCustomer, error: customerError } = await supabase
        .from('customers')
        .insert({
          full_name: payload.customerName,
          email: payload.customerEmail,
          phone: payload.customerPhone,
        })
        .select('id')
        .single()

      if (customerError) {
        console.error('Customer creation error:', customerError)
        return NextResponse.json(
          { error: 'Failed to create customer record' },
          { status: 500 }
        )
      }

      customerId = newCustomer.id
    }

    const startDateTime = new Date(`${payload.selectedDate}T${payload.selectedTime}:00`)
    const endDateTime = new Date(startDateTime.getTime() + payload.durationMinutes * 60000)

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .insert({
        customer_id: customerId,
        service_slug: payload.serviceSlug,
        people_count: payload.peopleCount,
        status: 'pending_payment',
        start_time: startDateTime.toISOString(),
        end_time: endDateTime.toISOString(),
        base_price: payload.basePrice,
        upsells_total: payload.upsellsTotal,
        discount_amount: payload.discountAmount,
        discount_type: payload.discountType,
        total_price: payload.totalPrice,
        deposit_due: payload.depositDue,
      })
      .select('id, customer_id, status, deposit_due, total_price, start_time, created_at')
      .single()

    if (bookingError) {
      console.error('Booking creation error:', bookingError)
      return NextResponse.json(
        { error: 'Failed to create booking' },
        { status: 500 }
      )
    }

    if (payload.selectedUpsellIds.length > 0) {
      const { data: upsells } = await supabase
        .from('upsells')
        .select('id, slug, price, duration_added_minutes')
        .in('slug', payload.selectedUpsellIds)

      if (upsells && upsells.length > 0) {
        const bookingUpsells = upsells.map((upsell) => ({
          booking_id: booking.id,
          upsell_id: upsell.id,
          quantity: 1,
          price_total: upsell.price,
          duration_added_minutes: upsell.duration_added_minutes,
        }))

        await supabase.from('booking_upsells').insert(bookingUpsells)
      }
    }

    return NextResponse.json({
      success: true,
      booking: {
        id: booking.id,
        customerId: booking.customer_id,
        status: booking.status,
        depositDue: booking.deposit_due,
        totalPrice: booking.total_price,
        startTime: booking.start_time,
        createdAt: booking.created_at,
      },
    })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
