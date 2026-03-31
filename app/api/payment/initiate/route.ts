import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = supabaseAdmin
    const body = await request.json()
    const { bookingId } = body

    if (!bookingId) {
      return NextResponse.json({ error: 'Missing bookingId' }, { status: 400 })
    }

    // Get booking
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .single()

    if (bookingError || !booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    const depositAmount = booking.deposit_due

    // Create merchant reference
    const merchantTransactionId = `BKG-${booking.id.slice(0, 8)}-${Date.now()}`

    // Store transaction
    const { error: insertError } = await supabase
      .from('payment_transactions')
      .insert({
  booking_id: booking.id,
  merchant_transaction_id: merchantTransactionId,
  amount: depositAmount,
  status: 'initiated',
  payment_status: 'PENDING',
  item_name: booking.service_name || booking.service_slug || 'Spa Booking',
})

    if (insertError) {
      console.error('Failed to create transaction:', insertError)
      return NextResponse.json({ error: 'Failed to create transaction' }, { status: 500 })
    }

    // PayFast config
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL

    const paymentData = {
      merchant_id: process.env.PAYFAST_MERCHANT_ID!,
      merchant_key: process.env.PAYFAST_MERCHANT_KEY!,
      return_url: `${baseUrl}/api/payment/return?transaction_id=${merchantTransactionId}`,
      cancel_url: `${baseUrl}/booking/cancelled`,
      notify_url: `${baseUrl}/api/payment/notify`,
      name_first: booking.client_name || 'Client',
      email_address: booking.client_email,
      m_payment_id: merchantTransactionId,
      amount: depositAmount.toFixed(2),
      item_name: booking.service_name || 'Spa Booking',
    }

    const query = new URLSearchParams(paymentData).toString()

    return NextResponse.json({
      paymentUrl: `https://www.payfast.co.za/eng/process?${query}`,
    })

  } catch (error) {
    console.error('Initiate payment error:', error)
    return NextResponse.json({ error: 'Failed to initiate payment' }, { status: 500 })
  }
}
