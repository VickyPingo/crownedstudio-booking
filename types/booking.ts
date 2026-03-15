import { ServicePricingOption } from './service'

export type PerPersonUpsells = Record<number, string[]>

export type MassagePressure = 'soft' | 'medium' | 'hard'

export interface BookingFormData {
  peopleCount: number
  selectedUpsells: string[]
  selectedUpsellsByPerson: PerPersonUpsells
  selectedDate: string
  selectedTime: string
  clientName: string
  clientEmail: string
  clientPhone: string
  clientAllergies: string
  clientMassagePressure: MassagePressure | ''
  clientMedicalHistory: string
  afterHoursSurcharge: number
  selectedPricingOption?: ServicePricingOption | null
}

export interface BookingPricing {
  servicePrice: number
  upsellsTotal: number
  afterHoursSurcharge: number
  subtotal: number
  discountAmount: number
  discountType: 'repeat_customer' | 'voucher' | null
  finalTotal: number
  depositAmount: number
}

export interface CreateBookingPayload {
  customerName: string
  customerEmail: string
  customerPhone: string
  customerAllergies: string
  customerMassagePressure: MassagePressure
  customerMedicalHistory: string
  serviceSlug: string
  selectedDate: string
  selectedTime: string
  durationMinutes: number
  peopleCount: number
  selectedUpsellIds: string[]
  selectedUpsellsByPerson: PerPersonUpsells
  basePrice: number
  upsellsTotal: number
  discountAmount: number
  discountType: string | null
  totalPrice: number
  depositDue: number
  voucherCode?: string | null
  voucherId?: string | null
  voucherDiscount?: number
  isZeroPayment?: boolean
  pricingOptionId?: string | null
  pricingOptionName?: string | null
}

export interface SavedBooking {
  id: string
  customerId: string
  status: 'pending_payment' | 'confirmed' | 'cancelled' | 'completed' | 'cancelled_expired'
  depositDue: number
  discountAmount: number
  discountType: 'repeat_customer' | 'voucher' | null
  totalPrice: number
  startTime: string
  paymentExpiresAt?: string
  createdAt: string
  voucherCode?: string | null
  voucherDiscount?: number
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
