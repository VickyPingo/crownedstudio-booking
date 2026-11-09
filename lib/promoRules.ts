/**
 * Per-service promotional rules that can't be expressed in the `services`
 * table alone. Safe to import from both client and server code.
 *
 * Day-of-week restrictions still live in `service_time_windows.days_allowed`.
 */
export interface PromoRule {
  /** Gift vouchers for this service expire at this moment (or after 6 months, whichever is sooner). ISO timestamp. */
  voucherExpiresAt?: string
  /** No appointments may be booked after this date (YYYY-MM-DD, SAST). */
  lastBookingDate?: string
  /** Block all dates in the `public_holidays` table for this service. */
  blockPublicHolidays?: boolean
  /** Require 100% payment upfront instead of the standard 50% deposit. */
  fullPrepayment?: boolean
  /** No 10% repeat-customer discount on this service. */
  noRepeatCustomerDiscount?: boolean
  /** Extra terms shown on the gift voucher purchase page. */
  voucherTerms?: string[]
}

export const PROMO_RULES: Record<string, PromoRule> = {
  'black-friday-special': {
    voucherExpiresAt: '2027-01-31T23:59:59+02:00',
    lastBookingDate: '2027-01-31',
    blockPublicHolidays: true,
    fullPrepayment: true,
    noRepeatCustomerDiscount: true,
    voucherTerms: [
      'R390 for 2 people, 1 hour and 20 minutes for the bookings.',
      '60 Minutes Full Body Massage, Hot Stones, Back Scrub.',
      'NOT valid on Saturdays and Public Holidays.',
      'FULL amount is payable in advance.',
      'Valid until 31 January 2027.',
      'Voucher rules stay the same: rescheduling must be done more than 24 hours ahead of time.',
      'No show counts as use of the voucher.',
    ],
  },
}

export function getPromoRule(slug?: string | null): PromoRule | null {
  if (!slug) return null
  return PROMO_RULES[slug] || null
}

export const STANDARD_DEPOSIT_PERCENT = 0.5

export function getDepositPercent(slug?: string | null): number {
  return getPromoRule(slug)?.fullPrepayment ? 1 : STANDARD_DEPOSIT_PERCENT
}

/** Gift voucher expiry: 6 months from now, capped at the promo's voucherExpiresAt. */
export function getVoucherExpiry(slug?: string | null, from: Date = new Date()): Date {
  const sixMonths = new Date(from)
  sixMonths.setMonth(sixMonths.getMonth() + 6)
  const cap = getPromoRule(slug)?.voucherExpiresAt
  if (cap) {
    const capDate = new Date(cap)
    if (capDate < sixMonths) return capDate
  }
  return sixMonths
}

export function isAfterLastBookingDate(slug: string | null | undefined, date: string): boolean {
  const last = getPromoRule(slug)?.lastBookingDate
  return !!last && date > last
}
