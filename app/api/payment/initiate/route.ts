import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { getPayfastConfig, generatePayfastPaymentUrl, splitName } from '@/lib/payfast'

interface InitiatePaymentRequest {
  bookingId: string
}

export async function POST(request: NextRequest) {
  try {
    const supabase = supabaseAdmin
    const { bookingId }: InitiatePaymentRequest = await request.json()

    if (!bookingId) {
      return NextResponse.json({ error: 'Booking ID is required' }, { status: 400 })
    }

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select(`
        id,
        customer_id,
        service_slug,
        status,
        deposit_due,
        total_price,
        start_time,
        customers (
          full_name,
          email
        ),
        services (
          name
        )
      `)
      .eq('id', bookingId)
      .maybeSingle()

    if (bookingError || !booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    if (booking.status !== 'pending_payment') {
      return NextResponse.json({ error: 'Booking is not awaiting payment' }, { status: 400 })
    }

    const customer = Array.isArray(booking.customers) ? booking.customers[0] : booking.customers
    const service = Array.isArray(booking.services) ? booking.services[0] : booking.services

    if (!customer || !service) {
      return NextResponse.json({ error: 'Invalid booking data' }, { status: 400 })
    }

    const merchantTransactionId = `BKG-${booking.id.slice(0, 8).toUpperCase()}-${Date.now()}`

    const { data: transaction, error: transactionError } = await supabase
      .from('payment_transactions')
      .insert({
        booking_id: booking.id,
        merchant_transaction_id: merchantTransactionId,
        status: 'initiated',
        amount: booking.deposit_due,
        item_name: `${service.name} - 50% Deposit`,
        item_description: `Booking deposit for ${service.name}`,
        name_first: splitName(customer.full_name).firstName,
        name_last: splitName(customer.full_name).lastName,
        email_address: customer.email,
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
      console.error('NEXT_PUBLIC_SITE_URL is not configured')
      return NextResponse.json({ error: 'Site URL not configured' }, { status: 500 })
    }

    if (!config.merchantId || !config.merchantKey) {
      console.error('[Payment Initiate] PayFast credentials missing:', {
        merchantId_present: !!config.merchantId,
        merchantKey_present: !!config.merchantKey,
      })
      return NextResponse.json({ error: 'Payment gateway not configured' }, { status: 500 })
    }

    console.log('[Payment Initiate] Using base URL:', baseUrl)
    console.log('[Payment Initiate] Merchant credentials verified:', {
      merchantId_present: !!config.merchantId,
      merchantKey_present: !!config.merchantKey,
      passphrase_present: !!config.passphrase,
    })

    const paymentData = {
      merchant_id: config.merchantId,
      merchant_key: config.merchantKey,
      return_url: `${baseUrl}/api/payment/return?transaction_id=${transaction.merchant_transaction_id}`,
      cancel_url: `${baseUrl}/api/payment/cancel?transaction_id=${transaction.merchant_transaction_id}`,
      notify_url: `${baseUrl}/api/payment/notify`,
      name_first: splitName(customer.full_name).firstName,
      name_last: splitName(customer.full_name).lastName,
      email_address: customer.email,
      m_payment_id: transaction.merchant_transaction_id,
      amount: booking.deposit_due.toString(),
      item_name: `${service.name} - 50% Deposit`,
      item_description: `Booking deposit for ${service.name}`,
    }

    const paymentUrl = generatePayfastPaymentUrl(paymentData, config)

    return NextResponse.json({
      success: true,
      paymentUrl,
      transactionId: transaction.merchant_transaction_id,
    })
  } catch (error) {
    console.error('Payment initiation error:', error)
    return NextResponse.json({ error: 'Failed to initiate payment' }, { status: 500 })
  }
}
