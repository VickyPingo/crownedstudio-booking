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
  rawDepositPaid: number
  rawBalancePaid: number
}

export function getPaymentState(booking: PaymentStateInput): PaymentStateResult {
  const completedTxns = (booking.payment_transactions || []).filter(p => p.status === 'complete')
  const txnTotal = completedTxns.reduce((sum, p) => sum + (p.amount || 0), 0)
  const rawBalancePaid = booking.balance_paid || 0
  const totalPrice = booking.total_price || 0

  const rawDepositPaid = txnTotal
  const totalPaid = Math.max(txnTotal, rawBalancePaid)

  if (booking.no_payment_required === true || totalPrice <= 0) {
    return {
      state: 'not_required',
      totalPaid: 0,
      depositPaid: 0,
      balancePaid: 0,
      balanceDue: 0,
      rawDepositPaid,
      rawBalancePaid,
    }
  }

  const balanceDue = Math.max(0, totalPrice - totalPaid)

  if (balanceDue <= 0 && totalPaid >= totalPrice) {
    return {
      state: 'fully_paid',
      totalPaid,
      depositPaid: rawDepositPaid,
      balancePaid: rawBalancePaid,
      balanceDue: 0,
      rawDepositPaid,
      rawBalancePaid,
    }
  }

  if (totalPaid > 0) {
    return {
      state: 'partially_paid',
      totalPaid,
      depositPaid: rawDepositPaid,
      balancePaid: rawBalancePaid,
      balanceDue,
      rawDepositPaid,
      rawBalancePaid,
    }
  }

  return {
    state: 'pending',
    totalPaid: 0,
    depositPaid: 0,
    balancePaid: 0,
    balanceDue,
    rawDepositPaid,
    rawBalancePaid,
  }
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
