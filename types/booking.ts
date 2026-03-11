export interface BookingFormData {
  peopleCount: number
  selectedUpsells: string[]
  selectedDate: string
  selectedTime: string
  clientName: string
  clientEmail: string
  clientPhone: string
}

export interface BookingPricing {
  servicePrice: number
  upsellsTotal: number
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

export const MOCK_TIME_SLOTS = [
  '09:00',
  '10:00',
  '11:00',
  '12:00',
  '14:00',
  '15:00',
  '16:00',
  '17:00',
]
