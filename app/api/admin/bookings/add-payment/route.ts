import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const { bookingId, amount, paymentMethod } = await req.json()

    const numericAmount = Number(amount)

    if (!bookingId || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      return NextResponse.json(
        { success: false, error: 'Missing or invalid fields' },
        { status: 400 }
      )
    }

    const now = new Date()
    const nowIso = now.toISOString()

    const { data: booking, error: bookingError } = await supabaseAdmin
      .from('bookings')
      .select('id, total_price, balance_paid, is_manual_booking, is_custom_booking')
      .eq('id', bookingId)
      .single()

    if (bookingError || !booking) {
      console.error('[AddPayment] Failed to load booking:', bookingError)
      return NextResponse.json(
        { success: false, error: 'Booking not found' },
        { status: 404 }
      )
    }

    if (!booking.is_manual_booking && !booking.is_custom_booking) {
      return NextResponse.json(
        { success: false, error: 'Manual payments are only allowed for manual/custom bookings' },
        { status: 400 }
      )
    }

    const currentPaid = Number(booking.balance_paid || 0)
    const newTotalPaid = currentPaid + numericAmount
    const cappedPaid = Math.min(newTotalPaid, Number(booking.total_price || 0))

    const merchantRef = `MANUAL-${bookingId}-${now.getTime()}`

    // 1) Insert payment transaction
    const { error: txError } = await supabaseAdmin
      .from('payment_transactions')
      .insert({
        booking_id: bookingId,
        amount: numericAmount,
        status: 'complete',
        payment_method: paymentMethod || 'manual',
        merchant_transaction_id: merchantRef,
        item_name: 'Manual Payment',
        created_at: nowIso,
      })

    if (txError) {
      console.error('[AddPayment] Failed to insert payment transaction:', txError)
      return NextResponse.json(
        { success: false, error: txError.message || 'Failed to record payment transaction' },
        { status: 500 }
      )
    }

    // 2) Update booking fallback totals so the drawer updates immediately and safely
    const { error: bookingUpdateError } = await supabaseAdmin
      .from('bookings')
      .update({
        balance_paid: cappedPaid,
        balance_paid_at: nowIso,
        status: 'confirmed',
      })
      .eq('id', bookingId)

    if (bookingUpdateError) {
      console.error('[AddPayment] Failed to update booking totals:', bookingUpdateError)
      return NextResponse.json(
        { success: false, error: bookingUpdateError.message || 'Failed to update booking payment totals' },
        { status: 500 }
      )
    }

    // 3) Optional note so staff can see a trace in booking notes
    const { error: noteError } = await supabaseAdmin
      .from('booking_notes')
      .insert({
        booking_id: bookingId,
        note: `Manual payment added: R${numericAmount}`,
        note_type: 'payment',
        created_at: nowIso,
      })

    if (noteError) {
      // Do not fail the whole request for note problems
      console.error('[AddPayment] Failed to insert booking note:', noteError)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[AddPayment] Unexpected error:', err)
    return NextResponse.json(
      { success: false, error: 'Server error' },
      { status: 500 }
    )
  }
}
