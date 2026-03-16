import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { getPayfastConfig, generatePayfastPaymentUrl, splitName } from '@/lib/payfast'

interface InitiateEventPaymentRequest {
  bookingId: string
}

export async function POST(request: NextRequest) {
  try {
    const supabase = supabaseAdmin
    const { bookingId }: InitiateEventPaymentRequest = await request.json()

    if (!bookingId) {
      return NextResponse.json({ error: 'Booking ID is required' }, { status: 400 })
    }

    const { data: booking, error: bookingError } = await supabase
      .from('event_bookings')
      .select(`
        id,
        booker_name,
        booker_email,
        total_amount,
        payment_status,
        events (
          title
        )
      `)
      .eq('id', bookingId)
      .maybeSingle()

    if (bookingError || !booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    if (booking.payment_status !== 'pending') {
      return NextResponse.json({ error: 'Booking is not awaiting payment' }, { status: 400 })
    }

    const event = Array.isArray(booking.events) ? booking.events[0] : booking.events

    if (!event) {
      return NextResponse.json({ error: 'Invalid booking data' }, { status: 400 })
    }

    const merchantTransactionId = `EVT-${booking.id.slice(0, 8).toUpperCase()}-${Date.now()}`

    const { data: transaction, error: transactionError } = await supabase
      .from('payment_transactions')
      .insert({
        booking_id: null,
        event_booking_id: booking.id,
        merchant_transaction_id: merchantTransactionId,
        status: 'initiated',
        amount: booking.total_amount,
        item_name: `${event.title} - Event Booking`,
        item_description: `Event booking for ${event.title}`,
        name_first: splitName(booking.booker_name).firstName,
        name_last: splitName(booking.booker_name).lastName,
        email_address: booking.booker_email,
      })
      .select('id, merchant_transaction_id')
      .single()

    if (transactionError || !transaction) {
      console.error('Transaction creation error:', transactionError)
      return NextResponse.json({ error: 'Failed to create payment transaction' }, { status: 500 })
    }

    const config = getPayfastConfig()
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL

    if (!baseUrl) {
      return NextResponse.json({ error: 'Site URL not configured' }, { status: 500 })
    }

    if (!config.merchantId || !config.merchantKey) {
      return NextResponse.json({ error: 'Payment gateway not configured' }, { status: 500 })
    }
console.log("EVENT PAYFAST BASE URL:", baseUrl)
    const paymentData = {
      merchant_id: config.merchantId,
      merchant_key: config.merchantKey,
      return_url: `${baseUrl}/api/events/payment/return?transaction_id=${transaction.merchant_transaction_id}`,
      cancel_url: `${baseUrl}/api/events/payment/cancel?transaction_id=${transaction.merchant_transaction_id}`,
      notify_url: `${baseUrl}/api/events/payment/notify`,
      name_first: splitName(booking.booker_name).firstName,
      name_last: splitName(booking.booker_name).lastName,
      email_address: booking.booker_email,
      m_payment_id: transaction.merchant_transaction_id,
      amount: booking.total_amount.toString(),
      item_name: `${event.title} - Event Booking`,
      item_description: `Event booking for ${event.title}`,
    }

    const paymentUrl = generatePayfastPaymentUrl(paymentData, config)

    return NextResponse.json({
      success: true,
      paymentUrl,
      transactionId: transaction.merchant_transaction_id,
    })
  } catch (error) {
    console.error('Event payment initiation error:', error)
    return NextResponse.json({ error: 'Failed to initiate payment' }, { status: 500 })
  }
}
