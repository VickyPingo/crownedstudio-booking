export interface BookingFormData {
  selectedUpsells: string[]
  selectedDate: string
  selectedTime: string
  clientName: string
  clientEmail: string
  clientPhone: string
  isRepeatCustomer: boolean
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

export function calculateBookingPricing(
  servicePrice: number,
  selectedUpsellsData: Array<{ id: string; price: number }>,
  isRepeatCustomer: boolean
): BookingPricing {
  const upsellsTotal = selectedUpsellsData.reduce((sum, upsell) => sum + upsell.price, 0)
  const subtotal = servicePrice + upsellsTotal

  let discountAmount = 0
  let discountType: 'repeat_customer' | null = null

  if (isRepeatCustomer) {
    discountAmount = Math.round(subtotal * 0.1)
    discountType = 'repeat_customer'
  }

  const finalTotal = subtotal - discountAmount
  const depositAmount = Math.round(finalTotal * 0.5)

  return {
    servicePrice,
    upsellsTotal,
    subtotal,
    discountAmount,
    discountType,
    finalTotal,
    depositAmount,
  }
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
