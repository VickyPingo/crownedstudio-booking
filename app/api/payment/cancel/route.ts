import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = supabaseAdmin
    const searchParams = request.nextUrl.searchParams
    const transactionId = searchParams.get('transaction_id')

    if (!transactionId) {
      return NextResponse.redirect(new URL('/?error=missing_transaction', request.url))
    }

    const { data: transaction, error: transactionError } = await supabase
      .from('payment_transactions')
      .select('id, booking_id, status')
      .eq('merchant_transaction_id', transactionId)
      .maybeSingle()

    if (transactionError || !transaction) {
      return NextResponse.redirect(new URL('/?error=transaction_not_found', request.url))
    }

    await supabase
      .from('payment_transactions')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', transaction.id)

    return NextResponse.redirect(
      new URL(`/booking/cancelled?booking_id=${transaction.booking_id}`, request.url)
    )
  } catch (error) {
    console.error('Cancel URL handler error:', error)
    return NextResponse.redirect(new URL('/?error=system_error', request.url))
  }
}
