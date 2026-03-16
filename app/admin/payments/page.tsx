'use client'

import { AdminLayout } from '@/components/admin/AdminLayout'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'

interface Booking {
  id: string
  total_price: number
  deposit_due: number
  balance_paid: number
  status: string
  start_time: string
  customer: {
    full_name: string
    email: string | null
  } | null
  service: {
    name: string
  } | null
  payment_transactions: {
    id: string
    status: string
    amount: number
    created_at: string
    payment_id: string | null
  }[]
}

type FilterStatus = 'all' | 'pending' | 'deposit_paid' | 'fully_paid'

export default function AdminPaymentsPage() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterStatus>('all')
  const [markingPayment, setMarkingPayment] = useState<string | null>(null)

  const fetchBookings = useCallback(async () => {
    setLoading(true)

    const { data, error } = await supabase
      .from('bookings')
      .select(`
        id,
        total_price,
        deposit_due,
        balance_paid,
        status,
        start_time,
        customer:customers(full_name, email),
        service:services(name),
        payment_transactions(id, status, amount, created_at, payment_id)
      `)
      .not('status', 'in', '(expired,cancelled_expired)')
      .order('start_time', { ascending: false })

    if (!error && data) {
      setBookings(data as unknown as Booking[])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchBookings()
  }, [fetchBookings])

  const getPaymentStatus = (booking: Booking) => {
    const completedPayments = booking.payment_transactions?.filter(p => p.status === 'complete') || []
    const depositPaid = completedPayments.reduce((sum, p) => sum + (p.amount || 0), 0)
    const balancePaid = booking.balance_paid || 0
    const totalPaid = depositPaid + balancePaid
    const balanceDue = Math.max(0, booking.total_price - totalPaid)

    if (balanceDue <= 0) {
      return { status: 'fully_paid', depositPaid, balancePaid, balanceDue, totalPaid }
    } else if (depositPaid > 0) {
      return { status: 'deposit_paid', depositPaid, balancePaid, balanceDue, totalPaid }
    }
    return { status: 'pending', depositPaid, balancePaid, balanceDue, totalPaid }
  }

  const filteredBookings = bookings.filter((booking) => {
    if (filter === 'all') return true
    const payment = getPaymentStatus(booking)
    return payment.status === filter
  })

  const handleMarkBalancePaid = async (bookingId: string, amount: number) => {
    setMarkingPayment(bookingId)

    const { data: { user } } = await supabase.auth.getUser()

    const { error } = await supabase
      .from('bookings')
      .update({
        balance_paid: amount,
        balance_paid_at: new Date().toISOString(),
        balance_paid_by: user?.id || null,
      })
      .eq('id', bookingId)

    if (!error) {
      fetchBookings()
    }
    setMarkingPayment(null)
  }

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: 'bg-amber-100 text-amber-800',
      deposit_paid: 'bg-blue-100 text-blue-800',
      fully_paid: 'bg-green-100 text-green-800',
    }
    return styles[status] || 'bg-gray-100 text-gray-800'
  }

  const formatStatus = (status: string) => {
    return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  }

  const stats = {
    totalReceived: bookings.reduce((sum, b) => {
      const payment = getPaymentStatus(b)
      return sum + payment.totalPaid
    }, 0),
    pendingBalance: bookings.reduce((sum, b) => {
      const payment = getPaymentStatus(b)
      return sum + payment.balanceDue
    }, 0),
    fullyPaid: bookings.filter(b => getPaymentStatus(b).status === 'fully_paid').length,
    awaitingBalance: bookings.filter(b => getPaymentStatus(b).status === 'deposit_paid').length,
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payments</h1>
          <p className="text-gray-600 mt-1">Track and manage booking payments.</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
          <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm">
            <p className="text-xs sm:text-sm font-medium text-gray-600">Total Received</p>
            <p className="text-lg sm:text-2xl font-bold text-green-700 mt-1">R{stats.totalReceived.toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm">
            <p className="text-xs sm:text-sm font-medium text-gray-600">Pending Balance</p>
            <p className="text-lg sm:text-2xl font-bold text-amber-700 mt-1">R{stats.pendingBalance.toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm">
            <p className="text-xs sm:text-sm font-medium text-gray-600">Fully Paid</p>
            <p className="text-lg sm:text-2xl font-bold text-gray-900 mt-1">{stats.fullyPaid}</p>
          </div>
          <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm">
            <p className="text-xs sm:text-sm font-medium text-gray-600">Awaiting Balance</p>
            <p className="text-lg sm:text-2xl font-bold text-gray-900 mt-1">{stats.awaitingBalance}</p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm">
          <div className="p-4 border-b">
            <div className="flex gap-2 flex-wrap">
              {([
                { value: 'all', label: 'All' },
                { value: 'pending', label: 'Pending' },
                { value: 'deposit_paid', label: 'Deposit Paid' },
                { value: 'fully_paid', label: 'Fully Paid' },
              ] as { value: FilterStatus; label: string }[]).map((status) => (
                <button
                  key={status.value}
                  onClick={() => setFilter(status.value)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    filter === status.value
                      ? 'bg-gray-900 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {status.label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-600">Loading payments...</div>
          ) : filteredBookings.length === 0 ? (
            <div className="p-8 text-center text-gray-600">No bookings found.</div>
          ) : (
            <>
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Client
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Service
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Total
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Deposit
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Balance Due
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredBookings.map((booking) => {
                      const payment = getPaymentStatus(booking)
                      return (
                        <tr key={booking.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4">
                            <p className="font-medium text-gray-900">{booking.customer?.full_name}</p>
                            <p className="text-sm text-gray-600">{booking.customer?.email}</p>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-gray-900">{booking.service?.name}</p>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-gray-900">
                              {new Date(booking.start_time).toLocaleDateString('en-ZA')}
                            </p>
                          </td>
                          <td className="px-6 py-4">
                            <p className="font-medium text-gray-900">R{booking.total_price?.toLocaleString()}</p>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-green-700 font-medium">R{payment.depositPaid.toLocaleString()}</p>
                          </td>
                          <td className="px-6 py-4">
                            <p className={`font-medium ${payment.balanceDue > 0 ? 'text-amber-700' : 'text-green-700'}`}>
                              R{payment.balanceDue.toLocaleString()}
                            </p>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-1 text-xs rounded-full ${getStatusBadge(payment.status)}`}>
                              {formatStatus(payment.status)}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            {payment.status === 'deposit_paid' && payment.balanceDue > 0 && (
                              <button
                                onClick={() => handleMarkBalancePaid(booking.id, payment.balanceDue)}
                                disabled={markingPayment === booking.id}
                                className="text-sm text-blue-600 hover:text-blue-800 font-medium disabled:opacity-50"
                              >
                                {markingPayment === booking.id ? 'Marking...' : 'Mark Paid'}
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="lg:hidden divide-y divide-gray-200">
                {filteredBookings.map((booking) => {
                  const payment = getPaymentStatus(booking)
                  return (
                    <div key={booking.id} className="p-4">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-gray-900 truncate">{booking.customer?.full_name}</p>
                          <p className="text-sm text-gray-600">{booking.service?.name}</p>
                        </div>
                        <span className={`px-2 py-1 text-xs rounded-full shrink-0 ${getStatusBadge(payment.status)}`}>
                          {formatStatus(payment.status)}
                        </span>
                      </div>
                      <div className="text-sm text-gray-600 mb-3">
                        {new Date(booking.start_time).toLocaleDateString('en-ZA')}
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-sm">
                        <div>
                          <p className="text-gray-500 text-xs">Total</p>
                          <p className="font-medium text-gray-900">R{booking.total_price?.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-gray-500 text-xs">Deposit</p>
                          <p className="font-medium text-green-700">R{payment.depositPaid.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-gray-500 text-xs">Balance</p>
                          <p className={`font-medium ${payment.balanceDue > 0 ? 'text-amber-700' : 'text-green-700'}`}>
                            R{payment.balanceDue.toLocaleString()}
                          </p>
                        </div>
                      </div>
                      {payment.status === 'deposit_paid' && payment.balanceDue > 0 && (
                        <button
                          onClick={() => handleMarkBalancePaid(booking.id, payment.balanceDue)}
                          disabled={markingPayment === booking.id}
                          className="mt-3 w-full py-2 text-sm text-blue-600 hover:text-blue-800 font-medium disabled:opacity-50 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
                        >
                          {markingPayment === booking.id ? 'Marking...' : 'Mark Balance as Paid'}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </AdminLayout>
  )
}
