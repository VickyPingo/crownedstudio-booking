import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const { bookingId, amount, paymentMethod } = await req.json()

    if (!bookingId || !amount) {
      return NextResponse.json({ success: false, error: 'Missing fields' }, { status: 400 })
    }

    const now = new Date()

    const merchantRef = `MANUAL-${bookingId}-${now.getTime()}`

    const { error } = await supabaseAdmin.from('payment_transactions').insert({
      booking_id: bookingId,
      amount: amount,
      status: 'complete',
      payment_method: paymentMethod || 'manual',
      merchant_transaction_id: merchantRef,
      item_name: 'Manual Payment',
      created_at: now.toISOString(),
    })

    if (error) {
      console.error(error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 })
  }
}
