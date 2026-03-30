export function getPaymentState(booking: PaymentStateInput): PaymentStateResult {
  const completedTxns = (booking.payment_transactions || []).filter(
    (p) => p.status === 'complete'
  )

  const txnTotal = completedTxns.reduce((sum, p) => sum + (p.amount || 0), 0)

  const totalPrice = booking.total_price || 0

  // 🔥 NEW LOGIC
  const totalPaid = txnTotal > 0 ? txnTotal : (booking.balance_paid || 0)

  if (booking.no_payment_required === true || totalPrice <= 0) {
    return {
      state: 'not_required',
      totalPaid: 0,
      depositPaid: 0,
      balancePaid: 0,
      balanceDue: 0,
      rawDepositPaid: txnTotal,
      rawBalancePaid: booking.balance_paid || 0,
    }
  }

  const balanceDue = Math.max(0, totalPrice - totalPaid)

  if (totalPaid >= totalPrice) {
    return {
      state: 'fully_paid',
      totalPaid,
      depositPaid: totalPaid,
      balancePaid: 0,
      balanceDue: 0,
      rawDepositPaid: txnTotal,
      rawBalancePaid: booking.balance_paid || 0,
    }
  }

  if (totalPaid > 0) {
    return {
      state: 'partially_paid',
      totalPaid,
      depositPaid: totalPaid,
      balancePaid: 0,
      balanceDue,
      rawDepositPaid: txnTotal,
      rawBalancePaid: booking.balance_paid || 0,
    }
  }

  return {
    state: 'pending',
    totalPaid: 0,
    depositPaid: 0,
    balancePaid: 0,
    balanceDue: totalPrice,
    rawDepositPaid: txnTotal,
    rawBalancePaid: booking.balance_paid || 0,
  }
}
