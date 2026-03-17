import { ServicePricingOption } from './service'

export type PerPersonUpsells = Record<number, string[]>
export type PerPersonPressure = Record<number, MassagePressure>

export type MassagePressure = 'soft' | 'medium' | 'hard'

export interface BookingFormData {
  peopleCount: number
  selectedUpsells: string[]
  selectedUpsellsByPerson: PerPersonUpsells
  pressureByPerson: PerPersonPressure
  selectedDate: string
  selectedTime: string
  clientName: string
  clientEmail: string
  clientPhone: string
  clientDateOfBirth: string
  clientAllergies: string
  clientMassagePressure: MassagePressure | ''
  clientMedicalHistory: string
  clientIsPregnant: boolean | null
  clientPregnancyWeeks: number | null
  afterHoursSurcharge: number
  selectedPricingOption?: ServicePricingOption | null
}

export interface BookingPricing {
  servicePrice: number
  upsellsTotal: number
  afterHoursSurcharge: number
  weekendSurcharge: number
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
  customerDateOfBirth: string
  customerAllergies: string
  customerMassagePressure: MassagePressure
  customerMedicalHistory: string
  customerIsPregnant: boolean
  customerPregnancyWeeks: number | null
  serviceSlug: string
  selectedDate: string
  selectedTime: string
  durationMinutes: number
  peopleCount: number
  selectedUpsellIds: string[]
  selectedUpsellsByPerson: PerPersonUpsells
  pressureByPerson: PerPersonPressure
  basePrice: number
  upsellsTotal: number
  weekendSurchargeAmount?: number
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
