/**
 * Booking Status Filtering Utilities
 *
 * Provides consistent logic for determining which bookings should be treated as
 * "active" (occupying rooms) vs inactive (cancelled, expired, etc.)
 */

export interface BookingWithStatus {
  status: string
  payment_expires_at?: string | null
}

/**
 * Determines if a booking should be considered "active" and occupying room space.
 *
 * A booking is active if:
 * - Status is 'confirmed' or 'completed'
 * - Status is 'pending_payment' AND payment window hasn't expired
 *
 * A booking is NOT active if:
 * - Status is 'cancelled', 'no_show', 'cancelled_expired', or any other status
 * - Status is 'pending_payment' but payment_expires_at has passed
 *
 * @param status - The booking status
 * @param paymentExpiresAt - ISO timestamp of when pending payment expires
 * @returns true if booking should block room availability
 */
export function isActiveBooking(status: string, paymentExpiresAt?: string | null): boolean {
  if (status === 'confirmed' || status === 'completed') {
    return true
  }

  if (status === 'pending_payment') {
    if (!paymentExpiresAt) {
      return false
    }
    return new Date(paymentExpiresAt).getTime() > Date.now()
  }

  // All other statuses (cancelled, no_show, cancelled_expired, etc.)
  return false
}

/**
 * Filter an array of bookings to only active ones.
 *
 * @param bookings - Array of booking objects with status and payment_expires_at
 * @returns Filtered array of only active bookings
 */
export function filterActiveBookings<T extends BookingWithStatus>(bookings: T[]): T[] {
  return bookings.filter(booking =>
    isActiveBooking(booking.status, booking.payment_expires_at)
  )
}

/**
 * SQL-compatible status array for querying only potentially active bookings.
 *
 * Use with Supabase: .in('status', ACTIVE_BOOKING_STATUSES)
 *
 * Note: This includes 'pending_payment' which requires additional filtering
 * by payment_expires_at. Use filterActiveBookings() on the results.
 */
export const ACTIVE_BOOKING_STATUSES = ['confirmed', 'completed', 'pending_payment'] as const

/**
 * SQL-compatible status array for querying all bookings that should be displayed
 * in admin views (including cancelled/no-show for historical context).
 *
 * Use with Supabase: .in('status', DISPLAY_BOOKING_STATUSES)
 */
export const DISPLAY_BOOKING_STATUSES = ['confirmed', 'completed', 'pending_payment', 'cancelled', 'no_show'] as const
