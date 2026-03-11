export interface Service {
  id: string
  name: string
  slug: string
  description: string | null
  price_1_person: number
  price_2_people: number
  price_3_people: number
  price_4_people: number
  price_5_people: number
  price_6_people: number
  max_people: number
  duration_minutes: number
  allowed_upsells: string | null
}

export interface ServiceWithUpsells extends Service {
  upsells: Upsell[]
}

export interface Upsell {
  id: string
  slug: string
  name: string
  price: number
  quantity_rule: 'per_person' | 'per_booking'
  duration_added_minutes: number
}
