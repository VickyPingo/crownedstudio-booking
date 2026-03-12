import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { getPayfastConfig, verifyPayfastSignature } from '@/lib/payfast'
import { fetchBookingForEmail, buildBookingEmailData, buildPaymentEmailData } from '@/lib/email/helpers'
import {
  sendPaymentReceivedToSpa,
  sendPaymentConfirmationToClient,
  sendBookingConfirmationToClient,
  scheduleReminder,
} from '@/lib/email/service'

async function sendPaymentEmails(bookingId: string, amountPaid: number, paymentReference: string) {
  try {
    const bookingData = await fetchBookingForEmail(bookingId)
    if (!bookingData) return

    const bookingEmailData = buildBookingEmailData(bookingData)
    const paymentEmailData = buildPaymentEmailData(bookingData, amountPaid, paymentReference)

    await Promise.all([
      sendPaymentReceivedToSpa(paymentEmailData),
      sendPaymentConfirmationToClient(paymentEmailData),
      sendBookingConfirmationToClient(bookingEmailData),
    ])

    const appointmentTime = new Date(bookingData.start_time)
    await scheduleReminder(bookingId, appointmentTime)
  } catch (error) {
    console.error('Error sending payment emails:', error)
  }
}

interface PayfastITN {
  m_payment_id: string
  pf_payment_id: string
  payment_status: string
  item_name: string
  item_description?: string
  amount_gross: string
  amount_fee: string
  amount_net: string
  custom_str1?: string
  custom_str2?: string
  custom_str3?: string
  custom_str4?: string
  custom_str5?: string
  custom_int1?: string
  custom_int2?: string
  custom_int3?: string
  custom_int4?: string
  custom_int5?: string
  name_first: string
  name_last: string
  email_address: string
  merchant_id: string
  signature: string
  [key: string]: string | undefined
}

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
      console.error('Invalid Payfast signature')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
    }

    const merchantTransactionId = itnData.m_payment_id
    const payfastPaymentId = itnData.pf_payment_id
    const paymentStatus = itnData.payment_status

    const { data: transaction, error: transactionError } = await supabase
      .from('payment_transactions')
      .select('id, booking_id, status, amount')
      .eq('merchant_transaction_id', merchantTransactionId)
      .maybeSingle()

    if (transactionError || !transaction) {
      console.error('Transaction not found:', merchantTransactionId)
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    }

    const receivedAmount = parseFloat(itnData.amount_gross)
    const expectedAmount = transaction.amount

    if (Math.abs(receivedAmount - expectedAmount) > 0.01) {
      console.error('Amount mismatch:', {
        merchantTransactionId,
        expected: expectedAmount,
        received: receivedAmount,
        difference: Math.abs(receivedAmount - expectedAmount)
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
            expected_amount: expectedAmount,
            received_amount: receivedAmount
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', transaction.id)

      return NextResponse.json({ error: 'Amount mismatch' }, { status: 400 })
    }

    if (transaction.status === 'complete') {
      console.log('Duplicate ITN for already completed transaction:', merchantTransactionId)
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

      const { error: bookingUpdateError } = await supabase
        .from('bookings')
        .update({
          status: 'confirmed',
          payment_expires_at: null,
        })
        .eq('id', transaction.booking_id)
        .in('status', ['pending_payment', 'pending'])

      if (bookingUpdateError) {
        console.error('Failed to update booking:', bookingUpdateError)
      }

      sendPaymentEmails(
        transaction.booking_id,
        receivedAmount,
        payfastPaymentId
      )
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
    console.error('ITN handler error:', error)
    return NextResponse.json({ error: 'ITN processing failed' }, { status: 500 })
  }
}
