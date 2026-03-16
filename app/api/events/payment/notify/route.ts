import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { getPayfastConfig, verifyPayfastSignature } from '@/lib/payfast'

export async function POST(request: NextRequest) {
  try {
    const supabase = supabaseAdmin
    const formData = await request.formData()

    const itnData: Record<string, string> = {}
    formData.forEach((value, key) => {
      itnData[key] = value.toString()
    })

    const config = getPayfastConfig()

    const dataToVerify: Record<string, string> = { ...itnData }
    const receivedSignature = dataToVerify.signature
    delete dataToVerify.signature

    const isValid = verifyPayfastSignature(dataToVerify, receivedSignature, config.passphrase)

    if (!isValid) {
      console.error('Invalid Payfast signature for event payment')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
    }

    const merchantTransactionId = itnData.m_payment_id
    const payfastPaymentId = itnData.pf_payment_id
    const paymentStatus = itnData.payment_status

    const { data: transaction, error: transactionError } = await supabase
      .from('payment_transactions')
      .select('id, event_booking_id, status, amount')
      .eq('merchant_transaction_id', merchantTransactionId)
      .maybeSingle()

    if (transactionError || !transaction) {
      console.error('Transaction not found:', merchantTransactionId)
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    }

    if (!transaction.event_booking_id) {
      console.error('Not an event booking transaction:', merchantTransactionId)
      return NextResponse.json({ error: 'Invalid transaction type' }, { status: 400 })
    }

    const receivedAmount = parseFloat(itnData.amount_gross)
    const expectedAmount = transaction.amount

    if (Math.abs(receivedAmount - expectedAmount) > 0.01) {
      console.error('Amount mismatch for event payment:', {
        merchantTransactionId,
        expected: expectedAmount,
        received: receivedAmount,
      })

      await supabase
        .from('payment_transactions')
        .update({
          status: 'failed',
          payment_status: paymentStatus,
          amount_gross: receivedAmount,
          amount_fee: parseFloat(itnData.amount_fee || '0'),
          amount_net: parseFloat(itnData.amount_net),
          merchant_id: itnData.merchant_id,
          signature: receivedSignature,
          raw_itn_data: {
            ...itnData,
            validation_error: 'AMOUNT_MISMATCH',
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', transaction.id)

      return NextResponse.json({ error: 'Amount mismatch' }, { status: 400 })
    }

    if (transaction.status === 'complete') {
      return NextResponse.json({ success: true, message: 'Already processed' })
    }

    const updateData: Record<string, unknown> = {
      payment_id: payfastPaymentId,
      payment_status: paymentStatus,
      amount_gross: parseFloat(itnData.amount_gross),
      amount_fee: parseFloat(itnData.amount_fee || '0'),
      amount_net: parseFloat(itnData.amount_net),
      merchant_id: itnData.merchant_id,
      signature: receivedSignature,
      raw_itn_data: itnData,
      updated_at: new Date().toISOString(),
    }

    if (paymentStatus === 'COMPLETE') {
      updateData.status = 'complete'

      await supabase
        .from('event_bookings')
        .update({
          payment_status: 'paid',
          booking_status: 'confirmed',
          payment_reference: payfastPaymentId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', transaction.event_booking_id)
    } else if (paymentStatus === 'FAILED' || paymentStatus === 'CANCELLED') {
      updateData.status = 'failed'
    } else {
      updateData.status = 'pending'
    }

    await supabase
      .from('payment_transactions')
      .update(updateData)
      .eq('id', transaction.id)
      .neq('status', 'complete')

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Event ITN handler error:', error)
    return NextResponse.json({ error: 'ITN processing failed' }, { status: 500 })
  }
}
