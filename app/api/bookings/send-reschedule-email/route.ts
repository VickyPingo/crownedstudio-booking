import { NextRequest, NextResponse } from 'next/server'
import { fetchBookingForEmail, buildBookingEmailData } from '@/lib/email/helpers'
import { sendBookingRescheduledToClient } from '@/lib/email/service'
import type { RescheduleEmailData } from '@/lib/email/templates'

export async function POST(request: NextRequest) {
  try {
    const { bookingId, oldStartTime, newStartTime } = await request.json()

    if (!bookingId || !oldStartTime || !newStartTime) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const booking = await fetchBookingForEmail(bookingId)

    if (!booking) {
      return NextResponse.json(
        { error: 'Booking not found' },
        { status: 404 }
      )
    }

    if (!booking.customer?.email) {
      return NextResponse.json(
        { error: 'No customer email available' },
        { status: 400 }
      )
    }

    const oldDate = new Date(oldStartTime)
    const newDate = new Date(newStartTime)

    const balancePaid = booking.balance_paid || 0
    const balanceDue = Math.max(0, booking.total_price - balancePaid)

    const rescheduleEmailData: RescheduleEmailData = {
      bookingId: booking.id,
      bookingReference: booking.id.slice(0, 8).toUpperCase(),
      clientName: booking.customer.full_name,
      clientEmail: booking.customer.email,
      serviceName: booking.service?.name || 'Service',
      pricingOptionName: booking.pricing_option_name || null,
      oldBookingDate: oldDate.toLocaleDateString('en-ZA', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'Africa/Johannesburg',
      }),
      oldBookingTime: oldDate.toLocaleTimeString('en-ZA', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Africa/Johannesburg',
      }),
      newBookingDate: newDate.toLocaleDateString('en-ZA', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'Africa/Johannesburg',
      }),
      newBookingTime: newDate.toLocaleTimeString('en-ZA', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Africa/Johannesburg',
      }),
      peopleCount: booking.people_count,
      totalPrice: booking.total_price,
      balanceDue,
    }

    const emailSent = await sendBookingRescheduledToClient(rescheduleEmailData)

    if (!emailSent) {
      return NextResponse.json(
        { error: 'Failed to send reschedule email' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Reschedule email sent successfully',
    })
  } catch (error) {
    console.error('Error sending reschedule email:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
