export interface Upsell {
  id: string
  name: string
  description: string
  price: number
}

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
  selectedUpsells: string[],
  isRepeatCustomer: boolean
): BookingPricing {
  const selectedUpsellsData = MOCK_UPSELLS.filter((upsell) =>
    selectedUpsells.includes(upsell.id)
  )

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

export const MOCK_UPSELLS: Upsell[] = [
  {
    id: 'upsell-1',
    name: 'Express Service',
    description: 'Get your service completed in half the time',
    price: 500,
  },
  {
    id: 'upsell-2',
    name: 'Premium Package',
    description: 'Includes additional styling and finishing touches',
    price: 750,
  },
  {
    id: 'upsell-3',
    name: 'Aftercare Kit',
    description: 'Complete maintenance kit for long-lasting results',
    price: 350,
  },
]

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
