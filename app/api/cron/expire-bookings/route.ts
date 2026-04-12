import { createClient } from '@supabase/supabase-js'

export async function GET(request: Request) {
  // Vercel automatically sends Authorization: Bearer <CRON_SECRET> for cron invocations.
  // Reject any request that doesn't carry the secret so the endpoint can't be
  // triggered arbitrarily from the public internet.
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const now = new Date().toISOString()

    const { error, count } = await supabase
      .from('bookings')
      .update({ status: 'expired' }, { count: 'exact' })
      .eq('status', 'pending_payment')
      .not('payment_expires_at', 'is', null)
      .lt('payment_expires_at', now)

    if (error) {
      console.error('[expire-bookings] Supabase error:', error)
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[expire-bookings] Expired ${count ?? 0} booking(s) at ${now}`)

    return new Response(
      JSON.stringify({ success: true, expiredAt: now, updated: count ?? 0 }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('[expire-bookings] Server error:', err)
    return new Response(
      JSON.stringify({ success: false, error: 'Server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
