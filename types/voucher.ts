export interface Voucher {
  id: string
  code: string
  discount_type: 'fixed' | 'percentage'
  discount_value: number
  min_spend: number
  usage_limit: number | null
  usage_count: number
  expires_at: string | null
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface VoucherUsage {
  id: string
  voucher_id: string
  booking_id: string
  discount_applied: number
  created_at: string
}

export interface VoucherValidationResult {
  valid: boolean
  voucher?: Voucher
  discount?: number
  error?: string
}
