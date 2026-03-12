export interface BookingFormData {
  peopleCount: number
  selectedUpsells: string[]
  selectedDate: string
  selectedTime: string
  clientName: string
  clientEmail: string
  clientPhone: string
  afterHoursSurcharge: number
}

export interface BookingPricing {
  servicePrice: number
  upsellsTotal: number
  afterHoursSurcharge: number
  subtotal: number
  discountAmount: number
  discountType: 'repeat_customer' | null
  finalTotal: number
  depositAmount: number
}

export interface CreateBookingPayload {
  customerName: string
  customerEmail: string
  customerPhone: string
  serviceSlug: string
  selectedDate: string
  selectedTime: string
  durationMinutes: number
  peopleCount: number
  selectedUpsellIds: string[]
  basePrice: number
  upsellsTotal: number
  discountAmount: number
  discountType: string | null
  totalPrice: number
  depositDue: number
}

export interface SavedBooking {
  id: string
  customerId: string
  status: 'pending_payment' | 'confirmed' | 'cancelled' | 'completed' | 'cancelled_expired'
  depositDue: number
  discountAmount: number
  discountType: 'repeat_customer' | null
  totalPrice: number
  startTime: string
  paymentExpiresAt?: string
  createdAt: string
}

export interface BusinessHoursData {
  open_time: string
  close_time: string
  after_hours_enabled: boolean
  after_hours_end_time: string | null
}

export interface ServiceTimeWindowData {
  service_slug: string
  start_time: string
  end_time: string
}
