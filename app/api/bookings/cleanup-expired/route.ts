import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const expectedToken = process.env.CRON_SECRET

    if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = supabaseAdmin
    const graceTime = new Date(Date.now() - 5 * 60 * 1000).toISOString()

    const { data: expiredBookings, error: fetchError } = await supabase
      .from('bookings')
      .select('id')
      .eq('status', 'pending_payment')
      .lt('payment_expires_at', graceTime)

    if (fetchError) {
      console.error('Error fetching expired bookings:', fetchError)
      return NextResponse.json({ error: 'Failed to fetch expired bookings' }, { status: 500 })
    }

    if (!expiredBookings || expiredBookings.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No expired bookings found',
        count: 0
      })
    }

    const bookingIds = expiredBookings.map(b => b.id)

    const { error: bookingUpdateError } = await supabase
      .from('bookings')
      .update({
        status: 'cancelled_expired',
        payment_expires_at: null,
      })
      .in('id', bookingIds)
      .eq('status', 'pending_payment')

    if (bookingUpdateError) {
      console.error('Error updating expired bookings:', bookingUpdateError)
      return NextResponse.json({ error: 'Failed to update bookings' }, { status: 500 })
    }

    const { error: transactionUpdateError } = await supabase
      .from('payment_transactions')
      .update({
        status: 'expired',
      })
      .in('booking_id', bookingIds)
      .eq('status', 'initiated')

    if (transactionUpdateError) {
      console.error('Error updating expired transactions:', transactionUpdateError)
    }

    return NextResponse.json({
      success: true,
      message: `Cancelled ${bookingIds.length} expired booking(s)`,
      count: bookingIds.length,
      bookingIds,
    })
  } catch (error) {
    console.error('Unexpected error in cleanup:', error)
    return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 })
  }
}
