import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendReminder24hToClient } from '@/lib/email/service'
import { BookingEmailData, GroupedUpsells } from '@/lib/email/templates'

const CRON_SECRET = process.env.CRON_SECRET

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SERVICE_ROLE_KEY!
  )
}

function isAuthorized(request: NextRequest): boolean {
  if (!CRON_SECRET || CRON_SECRET === 'your_cron_secret_here') {
    console.error('CRON_SECRET is not configured')
    return false
  }

  const vercelCronHeader = request.headers.get('x-vercel-cron')
  if (vercelCronHeader === '1') {
    return true
  }

  const authHeader = request.headers.get('authorization')
  if (authHeader === `Bearer ${CRON_SECRET}`) {
    return true
  }

  const url = new URL(request.url)
  const keyParam = url.searchParams.get('key')
  if (keyParam === CRON_SECRET) {
    return true
  }

  return false
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    console.warn('Cron send-reminders: Unauthorized access attempt')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (process.env.SEND_BOOKING_REMINDERS !== 'true') {
    console.log('Cron send-reminders: Reminders disabled via SEND_BOOKING_REMINDERS env flag')
    return NextResponse.json({ message: 'Reminders disabled', count: 0 })
  }

  console.log('Cron send-reminders: Starting execution')

  const supabase = getSupabaseAdmin()

  try {
    const now = new Date()
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000)
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000)

    const { data: pendingReminders, error: fetchError } = await supabase
      .from('scheduled_reminders')
      .select(`
        id,
        booking_id,
        scheduled_for,
        bookings (
          id,
          status,
          start_time,
          people_count,
          total_price,
          deposit_due,
          balance_paid,
          allergies,
          massage_pressure,
          voucher_code,
          voucher_discount,
          pricing_option_name,
          customer:customers (
            full_name,
            email,
            phone
          ),
          service:services (
            name
          ),
          booking_upsells (
            person_number,
            price_total,
            upsell:upsells (
              name,
              price
            )
          )
        )
      `)
      .eq('status', 'pending')
      .gte('scheduled_for', fiveMinutesAgo.toISOString())
      .lte('scheduled_for', fiveMinutesFromNow.toISOString())
      .limit(50)

    if (fetchError) {
      console.error('Cron send-reminders: Error fetching reminders:', fetchError)
      return NextResponse.json({ error: 'Failed to fetch reminders' }, { status: 500 })
    }

    if (!pendingReminders || pendingReminders.length === 0) {
      console.log('Cron send-reminders: No reminders due at this time')
      return NextResponse.json({ message: 'No reminders to send', count: 0 })
    }

    console.log(`Cron send-reminders: Found ${pendingReminders.length} reminders to process`)

    const results: { id: string; success: boolean; error?: string }[] = []

    for (const reminder of pendingReminders) {
      const bookingData = reminder.bookings as unknown as {
        id: string
        status: string
        start_time: string
        people_count: number
        total_price: number
        deposit_due: number
        balance_paid: number | null
        allergies: string | null
        massage_pressure: string | null
        voucher_code: string | null
        voucher_discount: number | null
        pricing_option_name: string | null
        customer: { full_name: string; email: string | null; phone: string | null } | null
        service: { name: string } | null
        booking_upsells: { person_number: number | null; price_total: number | null; upsell: { name: string; price: number } | null }[]
      } | null
      const booking = bookingData

      if (!booking || booking.status === 'cancelled' || booking.status === 'cancelled_expired' || booking.status === 'expired') {
        await supabase
          .from('scheduled_reminders')
          .update({ status: 'cancelled' })
          .eq('id', reminder.id)
        results.push({ id: reminder.id, success: true, error: 'Booking cancelled' })
        continue
      }

      if (!booking.customer?.email) {
        await supabase
          .from('scheduled_reminders')
          .update({ status: 'failed' })
          .eq('id', reminder.id)
        results.push({ id: reminder.id, success: false, error: 'No client email' })
        continue
      }

      const startTime = new Date(booking.start_time)
      const balancePaid = booking.balance_paid || 0
      const balanceDue = Math.max(0, booking.total_price - balancePaid)

      const upsellNames = booking.booking_upsells
        ?.map((bu) => bu.upsell?.name)
        .filter((name): name is string => !!name) || []

      const groupedUpsells: GroupedUpsells = {}
      for (const bu of booking.booking_upsells || []) {
        if (!bu.upsell?.name) continue
        const personNum = bu.person_number ?? 1
        if (!groupedUpsells[personNum]) {
          groupedUpsells[personNum] = []
        }
        groupedUpsells[personNum].push({
          name: bu.upsell.name,
          price: bu.price_total ?? bu.upsell.price ?? 0,
        })
      }

      const emailData: BookingEmailData = {
        bookingId: booking.id,
        bookingReference: booking.id.slice(0, 8).toUpperCase(),
        clientName: booking.customer.full_name,
        clientEmail: booking.customer.email,
        clientPhone: booking.customer.phone || '',
        serviceName: booking.service?.name || 'Service',
        pricingOptionName: booking.pricing_option_name || null,
        bookingDate: startTime.toLocaleDateString('en-ZA', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          timeZone: 'Africa/Johannesburg',
        }),
        bookingTime: startTime.toLocaleTimeString('en-ZA', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Africa/Johannesburg',
        }),
        peopleCount: booking.people_count,
        upsells: upsellNames,
        groupedUpsells,
        allergies: booking.allergies,
        massagePressure: booking.massage_pressure,
        medicalHistory: null,
        voucherCode: booking.voucher_code,
        voucherDiscount: booking.voucher_discount || 0,
        paymentStatus: booking.status,
        depositAmount: booking.deposit_due,
        totalPrice: booking.total_price,
        balanceDue,
        isManualBooking: false,
      }

      try {
        const success = await sendReminder24hToClient(emailData)

        await supabase
          .from('scheduled_reminders')
          .update({
            status: success ? 'sent' : 'failed',
            sent_at: success ? new Date().toISOString() : null,
          })
          .eq('id', reminder.id)

        results.push({ id: reminder.id, success })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        await supabase
          .from('scheduled_reminders')
          .update({ status: 'failed' })
          .eq('id', reminder.id)
        results.push({ id: reminder.id, success: false, error: message })
      }
    }

    const sent = results.filter((r) => r.success).length
    const failed = results.filter((r) => !r.success).length

    console.log(`Cron send-reminders: Completed. Sent: ${sent}, Failed: ${failed}`)

    return NextResponse.json({
      message: 'Reminders processed',
      total: results.length,
      sent,
      failed,
      results,
    })
  } catch (error) {
    console.error('Cron send-reminders: Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
