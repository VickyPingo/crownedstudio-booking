import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = supabaseAdmin
    const searchParams = request.nextUrl.searchParams
    const transactionId = searchParams.get('transaction_id')

    if (!transactionId) {
      return NextResponse.redirect(new URL('/booking/failed?reason=missing_transaction', request.url))
    }

    const { data: transaction, error: transactionError } = await supabase
      .from('payment_transactions')
      .select('id, booking_id, status')
      .eq('merchant_transaction_id', transactionId)
      .maybeSingle()

    if (transactionError || !transaction) {
      return NextResponse.redirect(new URL('/booking/failed?reason=transaction_not_found', request.url))
    }

    // Already confirmed by notify
    if (transaction.status === 'complete') {
      return NextResponse.redirect(
        new URL(`/booking/success?booking_id=${transaction.booking_id}`, request.url)
      )
    }

    // Emergency fallback for tonight:
    // if customer returned from PayFast and notify has not completed yet,
    // confirm it here so the booking does not stay stuck on pending.
    const nowIso = new Date().toISOString()

    const { error: txUpdateError } = await supabase
      .from('payment_transactions')
      .update({
        status: 'complete',
        payment_status: 'COMPLETE',
        updated_at: nowIso,
      })
      .eq('id', transaction.id)
      .in('status', ['initiated', 'pending'])

    if (txUpdateError) {
      console.error('Return fallback failed to update transaction:', txUpdateError)
      return NextResponse.redirect(
        new URL(`/booking/pending?booking_id=${transaction.booking_id}&reason=tx_update_failed`, request.url)
      )
    }

    const { error: bookingUpdateError } = await supabase
      .from('bookings')
      .update({
        status: 'confirmed',
        payment_expires_at: null,
      })
      .eq('id', transaction.booking_id)
      .in('status', ['pending_payment', 'pending'])

    if (bookingUpdateError) {
      console.error('Return fallback failed to update booking:', bookingUpdateError)
      return NextResponse.redirect(
        new URL(`/booking/pending?booking_id=${transaction.booking_id}&reason=booking_update_failed`, request.url)
      )
    }

    return NextResponse.redirect(
      new URL(`/booking/success?booking_id=${transaction.booking_id}`, request.url)
    )
  } catch (error) {
    console.error('Return URL handler error:', error)
    return NextResponse.redirect(new URL('/booking/failed?reason=system_error', request.url))
  }
}
