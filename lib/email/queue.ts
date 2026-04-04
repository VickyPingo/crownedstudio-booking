import { createClient } from '@supabase/supabase-js'
import { sendEmail } from './resend'
import {
  BookingEmailData,
  PaymentEmailData,
  newBookingToSpaTemplate,
  bookingConfirmationToClientTemplate,
  bookingRequestToClientTemplate,
  paymentReceivedToSpaTemplate,
  paymentConfirmationToClientTemplate,
  reminder24hToClientTemplate,
} from './templates'
import { fetchBookingForEmail, buildBookingEmailData } from './helpers'
import { sendReminder24hToClient } from './service'

type EmailType =
  | 'new_booking_spa'
  | 'booking_request'
  | 'booking_confirmation'
  | 'payment_received_spa'
  | 'payment_confirmation'
  | 'reminder_24h'

type EmailLogRow = {
  id: string
  booking_id: string
  email_type: EmailType
  recipient_email: string
  recipient_type: 'client' | 'spa'
  status: 'pending' | 'failed' | 'sent'
  payload: Record<string, unknown> | null
  attempts: number | null
  next_retry_at: string | null
  locked_at: string | null
}

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SERVICE_ROLE_KEY!
  )
}

function getBackoffMinutes(attempts: number) {
  if (attempts <= 1) return 5
  if (attempts === 2) return 10
  if (attempts === 3) return 20
  if (attempts === 4) return 40
  return 60
}

function getNextRetryAt(attempts: number) {
  const next = new Date()
  next.setMinutes(next.getMinutes() + getBackoffMinutes(attempts))
  return next.toISOString()
}

function buildEmailFromPayload(log: EmailLogRow) {
  const payload = log.payload || {}

  switch (log.email_type) {
    case 'new_booking_spa': {
      const data = payload as unknown as BookingEmailData
      return {
        subject: `New Booking: ${data.clientName} - ${data.serviceName} on ${data.bookingDate}`,
        html: newBookingToSpaTemplate(data),
      }
    }

    case 'booking_request': {
      const data = payload as unknown as BookingEmailData
      return {
        subject: 'Your Crowned Studio Booking Request',
        html: bookingRequestToClientTemplate(data),
      }
    }

    case 'booking_confirmation': {
      const data = payload as unknown as BookingEmailData
      return {
        subject: 'Your Crowned Studio Booking is Confirmed',
        html: bookingConfirmationToClientTemplate(data),
      }
    }

    case 'payment_received_spa': {
      const data = payload as unknown as PaymentEmailData
      return {
        subject: `Payment Received: R${data.amountPaid} from ${data.clientName}`,
        html: paymentReceivedToSpaTemplate(data),
      }
    }

    case 'payment_confirmation': {
      const data = payload as unknown as PaymentEmailData
      return {
        subject: `Payment Confirmed - R${data.amountPaid} Received`,
        html: paymentConfirmationToClientTemplate(data),
      }
    }

    case 'reminder_24h': {
      const data = payload as unknown as BookingEmailData
      return {
        subject: `Reminder: Your appointment tomorrow at ${data.bookingTime}`,
        html: reminder24hToClientTemplate(data),
      }
    }

    default:
      throw new Error(`Unsupported email type: ${log.email_type}`)
  }
}

async function markLogSent(logId: string, resendId?: string) {
  const supabase = getSupabaseAdmin()

  await supabase
    .from('email_logs')
    .update({
      status: 'sent',
      resend_id: resendId,
      error_message: null,
      sent_at: new Date().toISOString(),
      processed_at: new Date().toISOString(),
      locked_at: null,
      next_retry_at: null,
    })
    .eq('id', logId)
}

async function markLogFailed(logId: string, attempts: number, errorMessage: string) {
  const supabase = getSupabaseAdmin()

  await supabase
    .from('email_logs')
    .update({
      status: 'failed',
      error_message: errorMessage,
      last_attempt_at: new Date().toISOString(),
      locked_at: null,
      next_retry_at: getNextRetryAt(attempts),
    })
    .eq('id', logId)
}

async function reserveLog(log: EmailLogRow): Promise<boolean> {
  const supabase = getSupabaseAdmin()

  const { data, error } = await supabase
    .from('email_logs')
    .update({
      locked_at: new Date().toISOString(),
      last_attempt_at: new Date().toISOString(),
      attempts: (log.attempts || 0) + 1,
    })
    .eq('id', log.id)
    .is('locked_at', null)
    .select('id')
    .maybeSingle()

  if (error) {
    console.error('Failed to reserve email log', log.id, error)
    return false
  }

  return !!data
}

export async function processEmailQueue(limit = 20) {
  const supabase = getSupabaseAdmin()
  const nowIso = new Date().toISOString()

  const { data: logs, error } = await supabase
    .from('email_logs')
    .select('id, booking_id, email_type, recipient_email, recipient_type, status, payload, attempts, next_retry_at, locked_at, created_at')
    .in('status', ['pending', 'failed'])
    .or(`next_retry_at.is.null,next_retry_at.lte.${nowIso}`)
    .is('locked_at', null)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) {
    console.error('Failed to fetch email queue:', error)
    return { processed: 0, sent: 0, failed: 0 }
  }

  let processed = 0
  let sent = 0
  let failed = 0

  for (const rawLog of logs || []) {
    const log = rawLog as EmailLogRow

    const reserved = await reserveLog(log)
    if (!reserved) continue

    processed += 1

    try {
      const { data: alreadySent } = await supabase
        .from('email_logs')
        .select('id')
        .eq('booking_id', log.booking_id)
        .eq('email_type', log.email_type)
        .eq('status', 'sent')
        .neq('id', log.id)
        .maybeSingle()

      if (alreadySent) {
        await markLogSent(log.id)
        sent += 1
        continue
      }

      if (!log.payload) {
        throw new Error('Missing payload on email log. Cannot retry this old email safely.')
      }

      const { subject, html } = buildEmailFromPayload(log)
      const result = await sendEmail(log.recipient_email, subject, html)

      if (result.success) {
        await markLogSent(log.id, result.id)
        sent += 1
      } else {
        await markLogFailed(
          log.id,
          (log.attempts || 0) + 1,
          result.error || 'Unknown send error'
        )
        failed += 1
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown queue processing error'
      await markLogFailed(log.id, (log.attempts || 0) + 1, message)
      failed += 1
    }
  }

  return { processed, sent, failed }
}

export async function processDueReminders(limit = 20) {
  const supabase = getSupabaseAdmin()
  const nowIso = new Date().toISOString()

  const { data: reminders, error } = await supabase
    .from('scheduled_reminders')
    .select('id, booking_id, status, scheduled_for')
    .eq('status', 'pending')
    .lte('scheduled_for', nowIso)
    .order('scheduled_for', { ascending: true })
    .limit(limit)

  if (error) {
    console.error('Failed to fetch scheduled reminders:', error)
    return { processed: 0, sent: 0, failed: 0 }
  }

  let processed = 0
  let sent = 0
  let failed = 0

  for (const reminder of reminders || []) {
    processed += 1

    try {
      const booking = await fetchBookingForEmail(reminder.booking_id)
      if (!booking) {
        console.error('Reminder booking not found:', reminder.booking_id)
        failed += 1
        continue
      }

      const bookingData = buildBookingEmailData(booking)
      const ok = await sendReminder24hToClient(bookingData)

      if (ok) {
        await supabase
          .from('scheduled_reminders')
          .update({ status: 'sent' })
          .eq('id', reminder.id)

        sent += 1
      } else {
        failed += 1
      }
    } catch (err) {
      console.error('Reminder processing error:', err)
      failed += 1
    }
  }

  return { processed, sent, failed }
}
