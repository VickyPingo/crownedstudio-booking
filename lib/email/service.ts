import { createClient } from '@supabase/supabase-js'
import { sendEmail, SPA_EMAIL } from './resend'
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

type EmailType = 'new_booking_spa' | 'booking_request' | 'booking_confirmation' | 'payment_received_spa' | 'payment_confirmation' | 'reminder_24h'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SERVICE_ROLE_KEY!
  )
}

async function hasEmailBeenSent(bookingId: string, emailType: EmailType): Promise<boolean> {
  const supabase = getSupabaseAdmin()

  const { data } = await supabase
    .from('email_logs')
    .select('id')
    .eq('booking_id', bookingId)
    .eq('email_type', emailType)
    .eq('status', 'sent')
    .maybeSingle()

  return !!data
}

async function logEmailAttempt(
  bookingId: string,
  emailType: EmailType,
  recipientEmail: string,
  recipientType: 'client' | 'spa'
): Promise<string> {
  const supabase = getSupabaseAdmin()

  const { data, error } = await supabase
    .from('email_logs')
    .insert({
      booking_id: bookingId,
      email_type: emailType,
      recipient_email: recipientEmail,
      recipient_type: recipientType,
      status: 'pending',
    })
    .select('id')
    .single()

  if (error) {
    console.error('Failed to create email log:', error)
    throw error
  }

  return data.id
}

async function updateEmailLog(
  logId: string,
  status: 'sent' | 'failed',
  resendId?: string,
  errorMessage?: string
): Promise<void> {
  const supabase = getSupabaseAdmin()

  await supabase
    .from('email_logs')
    .update({
      status,
      resend_id: resendId,
      error_message: errorMessage,
      sent_at: status === 'sent' ? new Date().toISOString() : null,
    })
    .eq('id', logId)
}

export async function sendNewBookingToSpa(data: BookingEmailData): Promise<boolean> {
  const emailType: EmailType = 'new_booking_spa'

  if (await hasEmailBeenSent(data.bookingId, emailType)) {
    console.log(`Email ${emailType} already sent for booking ${data.bookingId}`)
    return true
  }

  const logId = await logEmailAttempt(data.bookingId, emailType, SPA_EMAIL, 'spa')

  const html = newBookingToSpaTemplate(data)
  const subject = `New Booking: ${data.clientName} - ${data.serviceName} on ${data.bookingDate}`

  const result = await sendEmail(SPA_EMAIL, subject, html)

  await updateEmailLog(logId, result.success ? 'sent' : 'failed', result.id, result.error)

  if (!result.success) {
    console.error(`Failed to send ${emailType}:`, result.error)
  }

  return result.success
}

export async function sendBookingRequestToClient(data: BookingEmailData): Promise<boolean> {
  const emailType: EmailType = 'booking_request'

  if (!data.clientEmail) {
    console.log('No client email provided, skipping booking request email')
    return false
  }

  if (await hasEmailBeenSent(data.bookingId, emailType)) {
    console.log(`Email ${emailType} already sent for booking ${data.bookingId}`)
    return true
  }

  const logId = await logEmailAttempt(data.bookingId, emailType, data.clientEmail, 'client')

  const html = bookingRequestToClientTemplate(data)
  const subject = 'Your Crowned Studio Booking Request'

  const result = await sendEmail(data.clientEmail, subject, html)

  await updateEmailLog(logId, result.success ? 'sent' : 'failed', result.id, result.error)

  if (!result.success) {
    console.error(`Failed to send ${emailType}:`, result.error)
  }

  return result.success
}

export async function sendBookingConfirmationToClient(data: BookingEmailData): Promise<boolean> {
  const emailType: EmailType = 'booking_confirmation'

  if (!data.clientEmail) {
    console.log('No client email provided, skipping booking confirmation')
    return false
  }

  if (await hasEmailBeenSent(data.bookingId, emailType)) {
    console.log(`Email ${emailType} already sent for booking ${data.bookingId}`)
    return true
  }

  const logId = await logEmailAttempt(data.bookingId, emailType, data.clientEmail, 'client')

  const html = bookingConfirmationToClientTemplate(data)
  const subject = 'Your Crowned Studio Booking is Confirmed'

  const result = await sendEmail(data.clientEmail, subject, html)

  await updateEmailLog(logId, result.success ? 'sent' : 'failed', result.id, result.error)

  if (!result.success) {
    console.error(`Failed to send ${emailType}:`, result.error)
  }

  return result.success
}

export async function sendPaymentReceivedToSpa(data: PaymentEmailData): Promise<boolean> {
  const emailType: EmailType = 'payment_received_spa'

  if (await hasEmailBeenSent(data.bookingId, emailType)) {
    console.log(`Email ${emailType} already sent for booking ${data.bookingId}`)
    return true
  }

  const logId = await logEmailAttempt(data.bookingId, emailType, SPA_EMAIL, 'spa')

  const html = paymentReceivedToSpaTemplate(data)
  const subject = `Payment Received: R${data.amountPaid} from ${data.clientName}`

  const result = await sendEmail(SPA_EMAIL, subject, html)

  await updateEmailLog(logId, result.success ? 'sent' : 'failed', result.id, result.error)

  if (!result.success) {
    console.error(`Failed to send ${emailType}:`, result.error)
  }

  return result.success
}

export async function sendPaymentConfirmationToClient(data: PaymentEmailData): Promise<boolean> {
  const emailType: EmailType = 'payment_confirmation'

  if (!data.clientEmail) {
    console.log('No client email provided, skipping payment confirmation')
    return false
  }

  if (await hasEmailBeenSent(data.bookingId, emailType)) {
    console.log(`Email ${emailType} already sent for booking ${data.bookingId}`)
    return true
  }

  const logId = await logEmailAttempt(data.bookingId, emailType, data.clientEmail, 'client')

  const html = paymentConfirmationToClientTemplate(data)
  const subject = `Payment Confirmed - R${data.amountPaid} Received`

  const result = await sendEmail(data.clientEmail, subject, html)

  await updateEmailLog(logId, result.success ? 'sent' : 'failed', result.id, result.error)

  if (!result.success) {
    console.error(`Failed to send ${emailType}:`, result.error)
  }

  return result.success
}

export async function sendReminder24hToClient(data: BookingEmailData): Promise<boolean> {
  const emailType: EmailType = 'reminder_24h'

  if (!data.clientEmail) {
    console.log('No client email provided, skipping reminder')
    return false
  }

  if (await hasEmailBeenSent(data.bookingId, emailType)) {
    console.log(`Email ${emailType} already sent for booking ${data.bookingId}`)
    return true
  }

  const logId = await logEmailAttempt(data.bookingId, emailType, data.clientEmail, 'client')

  const html = reminder24hToClientTemplate(data)
  const subject = `Reminder: Your appointment tomorrow at ${data.bookingTime}`

  const result = await sendEmail(data.clientEmail, subject, html)

  await updateEmailLog(logId, result.success ? 'sent' : 'failed', result.id, result.error)

  if (!result.success) {
    console.error(`Failed to send ${emailType}:`, result.error)
  }

  return result.success
}

export async function scheduleReminder(bookingId: string, appointmentTime: Date): Promise<void> {
  const supabase = getSupabaseAdmin()

  const reminderTime = new Date(appointmentTime.getTime() - 24 * 60 * 60 * 1000)

  if (reminderTime <= new Date()) {
    console.log('Appointment is less than 24 hours away, skipping reminder scheduling')
    return
  }

  const { data: existing } = await supabase
    .from('scheduled_reminders')
    .select('id')
    .eq('booking_id', bookingId)
    .eq('reminder_type', '24h_before')
    .maybeSingle()

  if (existing) {
    console.log('Reminder already scheduled for booking', bookingId)
    return
  }

  const { error } = await supabase
    .from('scheduled_reminders')
    .insert({
      booking_id: bookingId,
      reminder_type: '24h_before',
      scheduled_for: reminderTime.toISOString(),
      status: 'pending',
    })

  if (error) {
    console.error('Failed to schedule reminder:', error)
  }
}

export async function cancelReminder(bookingId: string): Promise<void> {
  const supabase = getSupabaseAdmin()

  await supabase
    .from('scheduled_reminders')
    .update({ status: 'cancelled' })
    .eq('booking_id', bookingId)
    .eq('status', 'pending')
}
