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
