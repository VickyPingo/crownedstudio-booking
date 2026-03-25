export type PaymentState = 'pending' | 'partially_paid' | 'fully_paid' | 'not_required'

export interface PaymentStateInput {
  total_price: number
  deposit_due?: number
  balance_paid?: number
  no_payment_required?: boolean
  status?: string
  payment_transactions?: Array<{ status: string; amount: number }>
}

export interface PaymentStateResult {
  state: PaymentState
  totalPaid: number
  depositPaid: number
  balancePaid: number
  balanceDue: number
}

export function getPaymentState(booking: PaymentStateInput): PaymentStateResult {
  const completedTxns = (booking.payment_transactions || []).filter(p => p.status === 'complete')
  const depositPaid = completedTxns.reduce((sum, p) => sum + (p.amount || 0), 0)
  const balancePaid = booking.balance_paid || 0
  const totalPrice = booking.total_price || 0

  // No payment required: state is not_required; amounts are zero because no money
  // was supposed to change hands. Any stored balance_paid value from legacy data
  // must not surface as "received" in this state.
  if (booking.no_payment_required === true || totalPrice <= 0) {
    return { state: 'not_required', totalPaid: 0, depositPaid: 0, balancePaid: 0, balanceDue: 0 }
  }

  // Calculate actual money received from transactions + manual balance payments
  const totalPaid = depositPaid + balancePaid
  const balanceDue = Math.max(0, totalPrice - totalPaid)

  // Fully paid: no outstanding balance and total matches
  if (balanceDue <= 0 && totalPaid >= totalPrice) {
    return { state: 'fully_paid', totalPaid, depositPaid, balancePaid, balanceDue: 0 }
  }

  // Partially paid: some money received but balance remains
  if (totalPaid > 0) {
    return { state: 'partially_paid', totalPaid, depositPaid, balancePaid, balanceDue }
  }

  // Pending: no money received yet
  return { state: 'pending', totalPaid, depositPaid, balancePaid, balanceDue }
}

export const PAYMENT_STATE_LABELS: Record<PaymentState, string> = {
  pending: 'Pending',
  partially_paid: 'Deposit Paid',
  fully_paid: 'Fully Paid',
  not_required: 'No Payment',
}

export const PAYMENT_STATE_STYLES: Record<PaymentState, string> = {
  pending: 'bg-amber-100 text-amber-800',
  partially_paid: 'bg-blue-100 text-blue-800',
  fully_paid: 'bg-green-100 text-green-800',
  not_required: 'bg-gray-100 text-gray-600',
}
