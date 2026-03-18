export type BookingStatus = 'pending_payment' | 'confirmed' | 'completed' | 'cancelled' | 'expired' | 'cancelled_expired' | 'no_show'

export interface BookingDetail {
  id: string
  customer_id: string
  service_slug: string
  pricing_option_slug: string | null
  people_count: number
  status: BookingStatus
  start_time: string
  end_time: string
  base_price: number
  surcharge_total: number
  upsells_total: number
  total_price: number
  deposit_due: number
  balance_paid: number
  balance_paid_at: string | null
  balance_paid_by: string | null
  internal_notes: string | null
  allergies: string | null
  massage_pressure: string
  medical_history: string | null
  voucher_code: string | null
  voucher_discount: number
  voucher_id: string | null
  room_id: string | null
  created_at: string
  customer: {
    id: string
    full_name: string
    email: string | null
    phone: string | null
  }
  service: {
    name: string
    category: string
    duration_minutes: number
    service_area: string
  }
  voucher: {
    code: string
    discount_type: string
    discount_value: number
  } | null
  room: {
    id: string
    room_name: string
    room_area: string
    capacity: number
  } | null
  booking_upsells: {
    upsell_id: string
    quantity: number
    price_total: number
    person_number: number
    upsell: {
      name: string
      slug: string
    }
  }[]
  booking_notes: {
    id: string
    note: string
    created_at: string
    created_by: string | null
  }[]
  payment_transactions: {
    id: string
    status: string
    amount: number
    created_at: string
  }[]
}

export interface Room {
  id: string
  room_name: string
  room_area: string
  capacity: number
  priority: number
  active: boolean
}

export interface TimeBlock {
  id: string
  block_date: string
  start_time: string | null
  end_time: string | null
  is_full_day: boolean
  reason: string | null
  created_by: string | null
  created_at: string
  room_id?: string | null
}

export interface CustomerProfile {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  date_of_birth: string | null
  allergies: string | null
  massage_pressure: string
  medical_notes: string | null
  private_notes: string | null
  created_at: string
  updated_at: string
}
