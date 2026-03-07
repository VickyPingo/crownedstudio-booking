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

    if (transaction.status === 'complete') {
      return NextResponse.redirect(
        new URL(`/booking/success?booking_id=${transaction.booking_id}`, request.url)
      )
    }

    return NextResponse.redirect(
      new URL(`/booking/pending?booking_id=${transaction.booking_id}`, request.url)
    )
  } catch (error) {
    console.error('Return URL handler error:', error)
    return NextResponse.redirect(new URL('/booking/failed?reason=system_error', request.url))
  }
}
