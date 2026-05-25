// lib/email/service.ts
// ─── ALL EXISTING CODE UNCHANGED — gift voucher functions added at the bottom ───

import { createClient } from '@supabase/supabase-js'
import { sendEmail, SPA_EMAIL } from './resend'
import {
  BookingEmailData,
  PaymentEmailData,
  EventBookingEmailData,
  RescheduleEmailData,
  newBookingToSpaTemplate,
  bookingConfirmationToClientTemplate,
  bookingRequestToClientTemplate,
  paymentReceivedToSpaTemplate,
  paymentConfirmationToClientTemplate,
  reminder24hToClientTemplate,
  eventBookingConfirmationToClientTemplate,
  eventBookingNotificationToSpaTemplate,
  bookingRescheduledToClientTemplate,
} from './templates'

type EmailType = 'new_booking_spa' | 'booking_request' | 'booking_confirmation' | 'payment_received_spa' | 'payment_confirmation' | 'reminder_24h'
const bookingEmailsEnabled = process.env.SEND_BOOKING_EMAILS === 'true'
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
  recipientType: 'client' | 'spa',
  payload?: Record<string, unknown>
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
      payload: payload ?? null,
      attempts: 0,
      next_retry_at: new Date().toISOString(),
      locked_at: null,
      processed_at: null,
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
      processed_at: status === 'sent' ? new Date().toISOString() : null,
      last_attempt_at: new Date().toISOString(),
      next_retry_at: status === 'failed' ? new Date().toISOString() : null,
      locked_at: null,
    })
    .eq('id', logId)
}
export async function sendNewBookingToSpa(data: BookingEmailData): Promise<boolean> {
  const emailType: EmailType = 'new_booking_spa'
  console.log(`[Email] Starting ${emailType} for booking ${data.bookingId}`)

  if (await hasEmailBeenSent(data.bookingId, emailType)) {
    console.log(`[Email] ${emailType} already sent for booking ${data.bookingId}, skipping`)
    return true
  }

  const logId = await logEmailAttempt(data.bookingId, emailType, SPA_EMAIL, 'spa', data as unknown as Record<string, unknown>)

  const html = newBookingToSpaTemplate(data)
  const subject = `New Booking: ${data.clientName} - ${data.serviceName} on ${data.bookingDate}`

  console.log(`[Email] Sending ${emailType} to ${SPA_EMAIL}`)
  const result = await sendEmail(SPA_EMAIL, subject, html)

  await updateEmailLog(logId, result.success ? 'sent' : 'failed', result.id, result.error)

  if (result.success) {
    console.log(`[Email] ${emailType} sent successfully for booking ${data.bookingId}`)
  } else {
    console.error(`[Email] ${emailType} FAILED for booking ${data.bookingId}:`, result.error)
  }

  return result.success
}

export async function sendBookingRequestToClient(data: BookingEmailData): Promise<boolean> {
  const emailType: EmailType = 'booking_request'
  console.log(`[Email] Starting ${emailType} for booking ${data.bookingId}`)

  if (!data.clientEmail) {
    console.log(`[Email] No client email provided for booking ${data.bookingId}, skipping ${emailType}`)
    return false
  }

  if (await hasEmailBeenSent(data.bookingId, emailType)) {
    console.log(`[Email] ${emailType} already sent for booking ${data.bookingId}, skipping`)
    return true
  }

  const logId = await logEmailAttempt(data.bookingId, emailType, data.clientEmail, 'client', data as unknown as Record<string, unknown>)

  const html = bookingRequestToClientTemplate(data)
  const subject = 'Your Crowned Studio Booking Request'

  console.log(`[Email] Sending ${emailType} to ${data.clientEmail}`)
  const result = await sendEmail(data.clientEmail, subject, html)

  await updateEmailLog(logId, result.success ? 'sent' : 'failed', result.id, result.error)

  if (result.success) {
    console.log(`[Email] ${emailType} sent successfully for booking ${data.bookingId}`)
  } else {
    console.error(`[Email] ${emailType} FAILED for booking ${data.bookingId}:`, result.error)
  }

  return result.success
}

export async function sendBookingConfirmationToClient(data: BookingEmailData): Promise<boolean> {
  if (!bookingEmailsEnabled) {
    console.log('[Email] Booking emails disabled')
    return true
  }

  const emailType: EmailType = 'booking_confirmation'
  console.log(`[Email] Starting ${emailType} for booking ${data.bookingId}`)
  if (!data.clientEmail) {
    console.log(`[Email] No client email provided for booking ${data.bookingId}, skipping ${emailType}`)
    return false
  }

  if (await hasEmailBeenSent(data.bookingId, emailType)) {
    console.log(`[Email] ${emailType} already sent for booking ${data.bookingId}, skipping`)
    return true
  }

  const logId = await logEmailAttempt(
  data.bookingId,
  emailType,
  data.clientEmail,
  'client',
  data as unknown as Record<string, unknown>
)

  const html = bookingConfirmationToClientTemplate(data)
  const subject = 'Your Crowned Studio Booking is Confirmed'

  console.log(`[Email] Sending ${emailType} to ${data.clientEmail}`)
  const result = await sendEmail(data.clientEmail, subject, html)

  await updateEmailLog(logId, result.success ? 'sent' : 'failed', result.id, result.error)

  if (result.success) {
    console.log(`[Email] ${emailType} sent successfully for booking ${data.bookingId}`)
  } else {
    console.error(`[Email] ${emailType} FAILED for booking ${data.bookingId}:`, result.error)
  }

  return result.success
}

export async function sendPaymentReceivedToSpa(data: PaymentEmailData): Promise<boolean> {
  const emailType: EmailType = 'payment_received_spa'
  console.log(`[Email] Starting ${emailType} for booking ${data.bookingId}`)

  if (await hasEmailBeenSent(data.bookingId, emailType)) {
    console.log(`[Email] ${emailType} already sent for booking ${data.bookingId}, skipping`)
    return true
  }

const logId = await logEmailAttempt(
  data.bookingId,
  emailType,
  SPA_EMAIL,
  'spa',
  data as unknown as Record<string, unknown>
)

  const html = paymentReceivedToSpaTemplate(data)
  const subject = `Payment Received: R${data.amountPaid} from ${data.clientName}`

  console.log(`[Email] Sending ${emailType} to ${SPA_EMAIL}`)
  const result = await sendEmail(SPA_EMAIL, subject, html)

  await updateEmailLog(logId, result.success ? 'sent' : 'failed', result.id, result.error)

  if (result.success) {
    console.log(`[Email] ${emailType} sent successfully for booking ${data.bookingId}`)
  } else {
    console.error(`[Email] ${emailType} FAILED for booking ${data.bookingId}:`, result.error)
  }

  return result.success
}

export async function sendPaymentConfirmationToClient(data: PaymentEmailData): Promise<boolean> {
  const emailType: EmailType = 'payment_confirmation'
  console.log(`[Email] Starting ${emailType} for booking ${data.bookingId}`)

  if (!data.clientEmail) {
    console.log(`[Email] No client email provided for booking ${data.bookingId}, skipping ${emailType}`)
    return false
  }

  if (await hasEmailBeenSent(data.bookingId, emailType)) {
    console.log(`[Email] ${emailType} already sent for booking ${data.bookingId}, skipping`)
    return true
  }

  const logId = await logEmailAttempt(
  data.bookingId,
  emailType,
  data.clientEmail,
  'client',
  data as unknown as Record<string, unknown>
)

  const html = paymentConfirmationToClientTemplate(data)
  const subject = `Payment Confirmed - R${data.amountPaid} Received`

  console.log(`[Email] Sending ${emailType} to ${data.clientEmail}`)
  const result = await sendEmail(data.clientEmail, subject, html)

  await updateEmailLog(logId, result.success ? 'sent' : 'failed', result.id, result.error)

  if (result.success) {
    console.log(`[Email] ${emailType} sent successfully for booking ${data.bookingId}`)
  } else {
    console.error(`[Email] ${emailType} FAILED for booking ${data.bookingId}:`, result.error)
  }

  return result.success
}

export async function sendReminder24hToClient(data: BookingEmailData): Promise<boolean> {
  const emailType: EmailType = 'reminder_24h'
  console.log(`[Email] Starting ${emailType} for booking ${data.bookingId}`)

  if (!data.clientEmail) {
    console.log(`[Email] No client email provided for booking ${data.bookingId}, skipping ${emailType}`)
    return false
  }

  if (await hasEmailBeenSent(data.bookingId, emailType)) {
    console.log(`[Email] ${emailType} already sent for booking ${data.bookingId}, skipping`)
    return true
  }

  const logId = await logEmailAttempt(
  data.bookingId,
  emailType,
  data.clientEmail,
  'client',
  data as unknown as Record<string, unknown>
)

  const html = reminder24hToClientTemplate(data)
  const subject = `Reminder: Your appointment tomorrow at ${data.bookingTime}`

  console.log(`[Email] Sending ${emailType} to ${data.clientEmail}`)
  const result = await sendEmail(data.clientEmail, subject, html)

  await updateEmailLog(logId, result.success ? 'sent' : 'failed', result.id, result.error)

  if (result.success) {
    console.log(`[Email] ${emailType} sent successfully for booking ${data.bookingId}`)
  } else {
    console.error(`[Email] ${emailType} FAILED for booking ${data.bookingId}:`, result.error)
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

export async function sendEventBookingConfirmationToClient(data: EventBookingEmailData): Promise<boolean> {
  console.log(`[Email] Starting event booking confirmation for client ${data.customerEmail}`)

  if (!data.customerEmail) {
    console.log(`[Email] No customer email provided for event booking ${data.eventBookingId}, skipping`)
    return false
  }

  const html = eventBookingConfirmationToClientTemplate(data)
  const subject = `Your Event Booking is Confirmed - ${data.eventTitle}`

  console.log(`[Email] Sending event booking confirmation to ${data.customerEmail}`)
  const result = await sendEmail(data.customerEmail, subject, html)

  if (result.success) {
    console.log(`[Email] Event booking confirmation sent successfully to ${data.customerEmail}`)
  } else {
    console.error(`[Email] Event booking confirmation FAILED for ${data.customerEmail}:`, result.error)
  }

  return result.success
}

export async function sendEventBookingNotificationToSpa(data: EventBookingEmailData): Promise<boolean> {
  console.log(`[Email] Starting event booking notification to spa for booking ${data.eventBookingId}`)

  const html = eventBookingNotificationToSpaTemplate(data)
  const subject = `New Event Booking: ${data.customerName} - ${data.eventTitle} (${data.quantity} tickets)`

  console.log(`[Email] Sending event booking notification to ${SPA_EMAIL}`)
  const result = await sendEmail(SPA_EMAIL, subject, html)

  if (result.success) {
    console.log(`[Email] Event booking notification sent successfully to spa`)
  } else {
    console.error(`[Email] Event booking notification FAILED:`, result.error)
  }

  return result.success
}

export async function sendBookingRescheduledToClient(data: RescheduleEmailData): Promise<boolean> {
  console.log(`[Email] Starting reschedule notification for booking ${data.bookingId}`)

  if (!data.clientEmail) {
    console.log(`[Email] No client email provided for booking ${data.bookingId}, skipping reschedule notification`)
    return false
  }

  const html = bookingRescheduledToClientTemplate(data)
  const subject = 'Your Crowned Studio Booking Has Been Rescheduled'

  console.log(`[Email] Sending reschedule notification to ${data.clientEmail}`)
  const result = await sendEmail(data.clientEmail, subject, html)

  if (result.success) {
    console.log(`[Email] Reschedule notification sent successfully for booking ${data.bookingId}`)
  } else {
    console.error(`[Email] Reschedule notification FAILED for booking ${data.bookingId}:`, result.error)
  }

  return result.success
}

// ─────────────────────────────────────────────────────────────────────────────
// GIFT VOUCHER EMAILS
// ─────────────────────────────────────────────────────────────────────────────

export interface GiftVoucherEmailData {
  voucherCode: string
  serviceName: string
  peopleCount: number
  amountPaid: number
  purchaserName: string
  purchaserEmail: string
  recipientName?: string | null
  recipientEmail?: string | null
  expiresAt: string
}

function formatGiftVoucherExpiry(expiresAt: string): string {
  return new Date(expiresAt).toLocaleDateString('en-ZA', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function buildGiftVoucherClientEmail(data: GiftVoucherEmailData): string {
  const displayName = data.recipientName ? `for ${data.recipientName} ` : ''
  const expiryFormatted = formatGiftVoucherExpiry(data.expiresAt)
  const peopleText = data.peopleCount === 1 ? '1 person' : `${data.peopleCount} people`

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e5e5;">

    <div style="background:#111111;padding:32px 32px 24px;text-align:center;">
      <p style="margin:0 0 8px;font-size:32px;">🎁</p>
      <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">Gift Voucher ${displayName}Purchased</h1>
      <p style="margin:8px 0 0;color:#999;font-size:14px;">Crowned Studio</p>
    </div>

    <div style="padding:32px;">
      <p style="margin:0 0 24px;color:#444;font-size:15px;line-height:1.6;">
        Hi ${data.purchaserName}, your gift voucher purchase is confirmed!
        ${data.recipientName ? `This voucher is for <strong>${data.recipientName}</strong>.` : ''}
      </p>

      <div style="background:#f9f9f9;border:2px dashed #ddd;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
        <p style="margin:0 0 4px;font-size:12px;color:#999;font-weight:600;letter-spacing:2px;text-transform:uppercase;">Voucher Code</p>
        <p style="margin:0;font-size:32px;font-family:monospace;font-weight:700;color:#111;letter-spacing:4px;">${data.voucherCode}</p>
      </div>

      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr>
          <td style="padding:10px 0;color:#666;font-size:14px;border-bottom:1px solid #f0f0f0;">Service</td>
          <td style="padding:10px 0;color:#111;font-size:14px;font-weight:600;text-align:right;border-bottom:1px solid #f0f0f0;">${data.serviceName}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;color:#666;font-size:14px;border-bottom:1px solid #f0f0f0;">People</td>
          <td style="padding:10px 0;color:#111;font-size:14px;text-align:right;border-bottom:1px solid #f0f0f0;">${peopleText}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;color:#666;font-size:14px;border-bottom:1px solid #f0f0f0;">Amount Paid</td>
          <td style="padding:10px 0;color:#111;font-size:14px;font-weight:600;text-align:right;border-bottom:1px solid #f0f0f0;">R${data.amountPaid.toLocaleString()}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;color:#666;font-size:14px;">Valid Until</td>
          <td style="padding:10px 0;color:#111;font-size:14px;text-align:right;">${expiryFormatted}</td>
        </tr>
      </table>

      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:16px;margin-bottom:24px;">
        <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#92400e;">How to redeem</p>
        <p style="margin:0 0 4px;font-size:13px;color:#78350f;">1. Visit the Crowned Studio booking page</p>
        <p style="margin:0 0 4px;font-size:13px;color:#78350f;">2. Choose your preferred date and time</p>
        <p style="margin:0 0 4px;font-size:13px;color:#78350f;">3. Enter this voucher code at checkout</p>
        <p style="margin:0;font-size:13px;color:#78350f;">4. Your booking is fully paid — enjoy!</p>
      </div>

      <p style="margin:0;font-size:12px;color:#aaa;text-align:center;">
        Gift vouchers are non-refundable and valid for 6 months from purchase.
      </p>
    </div>

  </div>
</body>
</html>
  `.trim()
}

function buildGiftVoucherSpaEmail(data: GiftVoucherEmailData): string {
  const expiryFormatted = formatGiftVoucherExpiry(data.expiresAt)
  const peopleText = data.peopleCount === 1 ? '1 person' : `${data.peopleCount} people`

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e5e5;">

    <div style="background:#111111;padding:24px 32px;">
      <h1 style="margin:0;color:#ffffff;font-size:18px;font-weight:700;">🎁 New Gift Voucher Sale</h1>
    </div>

    <div style="padding:24px 32px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:8px 0;color:#666;font-size:14px;border-bottom:1px solid #f0f0f0;width:40%;">Voucher Code</td>
          <td style="padding:8px 0;color:#111;font-size:14px;font-weight:700;border-bottom:1px solid #f0f0f0;font-family:monospace;">${data.voucherCode}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#666;font-size:14px;border-bottom:1px solid #f0f0f0;">Service</td>
          <td style="padding:8px 0;color:#111;font-size:14px;border-bottom:1px solid #f0f0f0;">${data.serviceName}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#666;font-size:14px;border-bottom:1px solid #f0f0f0;">People</td>
          <td style="padding:8px 0;color:#111;font-size:14px;border-bottom:1px solid #f0f0f0;">${peopleText}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#666;font-size:14px;border-bottom:1px solid #f0f0f0;">Amount</td>
          <td style="padding:8px 0;color:#111;font-size:14px;font-weight:700;border-bottom:1px solid #f0f0f0;">R${data.amountPaid.toLocaleString()}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#666;font-size:14px;border-bottom:1px solid #f0f0f0;">Purchased By</td>
          <td style="padding:8px 0;color:#111;font-size:14px;border-bottom:1px solid #f0f0f0;">${data.purchaserName} (${data.purchaserEmail})</td>
        </tr>
        ${data.recipientName ? `
        <tr>
          <td style="padding:8px 0;color:#666;font-size:14px;border-bottom:1px solid #f0f0f0;">For</td>
          <td style="padding:8px 0;color:#111;font-size:14px;border-bottom:1px solid #f0f0f0;">${data.recipientName}${data.recipientEmail ? ` (${data.recipientEmail})` : ''}</td>
        </tr>
        ` : ''}
        <tr>
          <td style="padding:8px 0;color:#666;font-size:14px;">Expires</td>
          <td style="padding:8px 0;color:#111;font-size:14px;">${expiryFormatted}</td>
        </tr>
      </table>
    </div>

  </div>
</body>
</html>
  `.trim()
}

/**
 * Sends gift voucher emails to the purchaser (and optionally the recipient)
 * plus a notification to the spa. Fire-and-forget — does not use email_logs.
 */
export async function sendGiftVoucherEmails(data: GiftVoucherEmailData): Promise<void> {
  const peopleText = data.peopleCount === 1 ? '1 person' : `${data.peopleCount} people`

  // Email 1: Purchaser confirmation
  const clientHtml = buildGiftVoucherClientEmail(data)
  const clientSubject = `Your Gift Voucher for ${data.serviceName} — ${data.voucherCode}`
  const clientResult = await sendEmail(data.purchaserEmail, clientSubject, clientHtml)
  console.log(`[GiftVoucher Email] Purchaser (${data.purchaserEmail}): ${clientResult.success ? 'sent' : 'FAILED'}`)

  // Email 2: Recipient (if provided and different from purchaser)
  if (data.recipientEmail && data.recipientEmail !== data.purchaserEmail) {
    const recipientHtml = buildGiftVoucherClientEmail({
      ...data,
      purchaserName: data.recipientName || data.purchaserName,
    })
    const recipientSubject = `You've received a Gift Voucher for ${data.serviceName}!`
    const recipientResult = await sendEmail(data.recipientEmail, recipientSubject, recipientHtml)
    console.log(`[GiftVoucher Email] Recipient (${data.recipientEmail}): ${recipientResult.success ? 'sent' : 'FAILED'}`)
  }

  // Email 3: Spa notification
  const spaHtml = buildGiftVoucherSpaEmail(data)
  const spaSubject = `Gift Voucher Sold: ${data.serviceName} × ${peopleText} — R${data.amountPaid.toLocaleString()}`
  const spaResult = await sendEmail(SPA_EMAIL, spaSubject, spaHtml)
  console.log(`[GiftVoucher Email] Spa (${SPA_EMAIL}): ${spaResult.success ? 'sent' : 'FAILED'}`)
}
