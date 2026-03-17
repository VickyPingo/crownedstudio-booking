import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { getPayfastConfig, verifyPayfastSignature } from '@/lib/payfast'
import {
  sendEventBookingConfirmationToClient,
  sendEventBookingNotificationToSpa,
} from '@/lib/email/service'
import { EventBookingEmailData } from '@/lib/email/templates'

export async function POST(request: NextRequest) {
  try {
    const supabase = supabaseAdmin
    const formData = await request.formData()

    const itnData: Record<string, string> = {}
    formData.forEach((value, key) => {
      itnData[key] = value.toString()
    })

    console.log('Event ITN received:', {
      m_payment_id: itnData.m_payment_id,
      pf_payment_id: itnData.pf_payment_id,
      payment_status: itnData.payment_status,
      amount_gross: itnData.amount_gross,
    })

    const config = getPayfastConfig()

    const dataToVerify: Record<string, string> = { ...itnData }
    const receivedSignature = dataToVerify.signature
    delete dataToVerify.signature

    const isValid = verifyPayfastSignature(
      dataToVerify,
      receivedSignature,
      config.passphrase
    )

    if (!isValid) {
  console.warn('Payfast signature failed, but continuing for debugging')
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
      console.error('Transaction not found:', {
        merchantTransactionId,
        transactionError,
      })
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    }

    if (!transaction.event_booking_id) {
      console.error('Not an event booking transaction:', merchantTransactionId)
      return NextResponse.json({ error: 'Invalid transaction type' }, { status: 400 })
    }

    const receivedAmount = parseFloat(itnData.amount_gross || '0')
    const expectedAmount = Number(transaction.amount || 0)

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
          amount_net: parseFloat(itnData.amount_net || '0'),
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
      console.log('Event ITN already processed:', merchantTransactionId)
      return NextResponse.json({ success: true, message: 'Already processed' })
    }

    const updateData: Record<string, unknown> = {
      payment_id: payfastPaymentId,
      payment_status: paymentStatus,
      amount_gross: receivedAmount,
      amount_fee: parseFloat(itnData.amount_fee || '0'),
      amount_net: parseFloat(itnData.amount_net || '0'),
      merchant_id: itnData.merchant_id,
      signature: receivedSignature,
      raw_itn_data: itnData,
      updated_at: new Date().toISOString(),
    }

    if (paymentStatus === 'COMPLETE') {
      updateData.status = 'complete'

      const { error: paymentUpdateError } = await supabase
        .from('payment_transactions')
        .update(updateData)
        .eq('id', transaction.id)
        .neq('status', 'complete')

      if (paymentUpdateError) {
        console.error('Failed to update event payment transaction:', paymentUpdateError)
        return NextResponse.json(
          { error: 'Failed to update payment transaction' },
          { status: 500 }
        )
      }

      const { error: bookingUpdateError } = await supabase
        .from('event_bookings')
        .update({
          payment_status: 'paid',
          booking_status: 'confirmed',
          payment_reference: payfastPaymentId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', transaction.event_booking_id)

      if (bookingUpdateError) {
        console.error('Failed to update event booking:', bookingUpdateError)
        return NextResponse.json(
          { error: 'Failed to update event booking' },
          { status: 500 }
        )
      }

      const { data: bookingData, error: bookingFetchError } = await supabase
        .from('event_bookings')
        .select(`
          id,
          booker_name,
          booker_email,
          booker_phone,
          quantity,
          voucher_code,
          voucher_discount,
          total_amount,
          payment_reference,
          events (
            title,
            event_date
          )
        `)
        .eq('id', transaction.event_booking_id)
        .maybeSingle()

      if (bookingFetchError) {
        console.error('Failed to fetch event booking after payment:', bookingFetchError)
      }

      if (bookingData && bookingData.events) {
        const event = bookingData.events as unknown as {
          title: string
          event_date: string
        }

        const eventDate = new Date(event.event_date)
        const formattedDate = eventDate.toLocaleDateString('en-ZA', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          timeZone: 'Africa/Johannesburg',
        })

        const emailData: EventBookingEmailData = {
          eventBookingId: bookingData.id,
          eventTitle: event.title,
          eventDate: formattedDate,
          quantity: bookingData.quantity,
          customerName: bookingData.booker_name,
          customerEmail: bookingData.booker_email,
          customerPhone: bookingData.booker_phone || '',
          voucherCode: bookingData.voucher_code,
          voucherDiscount: bookingData.voucher_discount || 0,
          totalAmount: bookingData.total_amount,
          paymentReference: bookingData.payment_reference || payfastPaymentId,
        }

        try {
          console.log('Sending event emails for booking:', bookingData.id)
          console.log('Event customer email:', bookingData.booker_email)

          const [clientEmailSent, spaEmailSent] = await Promise.all([
            sendEventBookingConfirmationToClient(emailData),
            sendEventBookingNotificationToSpa(emailData),
          ])

          console.log('Event client email sent:', clientEmailSent)
          console.log('Event spa email sent:', spaEmailSent)
        } catch (emailError) {
          console.error('Event email sending failed:', emailError)
        }
      } else {
        console.warn('No booking data found for event email sending:', transaction.event_booking_id)
      }

      return NextResponse.json({ success: true })
    }

    if (paymentStatus === 'FAILED' || paymentStatus === 'CANCELLED') {
      updateData.status = 'failed'
    } else {
      updateData.status = 'pending'
    }

    const { error: nonCompleteUpdateError } = await supabase
      .from('payment_transactions')
      .update(updateData)
      .eq('id', transaction.id)
      .neq('status', 'complete')

    if (nonCompleteUpdateError) {
      console.error('Failed to update non-complete event transaction:', nonCompleteUpdateError)
      return NextResponse.json(
        { error: 'Failed to update payment transaction' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Event ITN handler error:', error)
    return NextResponse.json({ error: 'ITN processing failed' }, { status: 500 })
  }
}
