export interface Event {
  id: string
  title: string
  slug: string
  description: string | null
  event_date: string
  price_per_person: number
  is_active: boolean
  created_at: string
}

export interface EventBooking {
  id: string
  event_id: string
  customer_id: string | null
  booker_name: string
  booker_email: string
  booker_phone: string
  quantity: number
  price_per_person: number
  subtotal_amount: number
  voucher_code: string | null
  voucher_discount: number
  total_amount: number
  payment_status: string
  booking_status: string
  payment_reference: string | null
  created_at: string
  updated_at: string
}

export interface CreateEventBookingPayload {
  eventSlug: string
  bookerName: string
  bookerEmail: string
  bookerPhone: string
  quantity: number
  voucherCode?: string | null
  voucherDiscount?: number
}
