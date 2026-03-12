import { NextRequest, NextResponse } from 'next/server'
import { fetchBookingForEmail, buildBookingEmailData } from '@/lib/email/helpers'
import {
  sendNewBookingToSpa,
  sendBookingConfirmationToClient,
  scheduleReminder,
} from '@/lib/email/service'

export async function POST(request: NextRequest) {
  try {
    const { bookingId, sendConfirmation } = await request.json()

    if (!bookingId) {
      return NextResponse.json({ error: 'Missing bookingId' }, { status: 400 })
    }

    const bookingData = await fetchBookingForEmail(bookingId)
    if (!bookingData) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    const emailData = buildBookingEmailData(bookingData)

    const results: Record<string, boolean> = {}

    results.newBookingSpa = await sendNewBookingToSpa(emailData)

    if (sendConfirmation && bookingData.status === 'confirmed') {
      results.bookingConfirmation = await sendBookingConfirmationToClient(emailData)

      const appointmentTime = new Date(bookingData.start_time)
      await scheduleReminder(bookingId, appointmentTime)
      results.reminderScheduled = true
    }

    return NextResponse.json({ success: true, results })
  } catch (error) {
    console.error('Error sending booking emails:', error)
    return NextResponse.json({ error: 'Failed to send emails' }, { status: 500 })
  }
}
