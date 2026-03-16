'use client'

import { AdminLayout } from '@/components/admin/AdminLayout'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'

interface SpaBooking {
  type: 'spa'
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

interface EventBookingPayment {
  type: 'event'
  id: string
  event_title: string
  booker_name: string
  booker_email: string
  quantity: number
  total_amount: number
  payment_status: string
  created_at: string
}

type PaymentItem = SpaBooking | EventBookingPayment

type FilterStatus = 'all' | 'pending' | 'deposit_paid' | 'fully_paid'
type ViewMode = 'all' | 'spa' | 'events'

export default function AdminPaymentsPage() {
  const [spaBookings, setSpaBookings] = useState<SpaBooking[]>([])
  const [eventPayments, setEventPayments] = useState<EventBookingPayment[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterStatus>('all')
  const [viewMode, setViewMode] = useState<ViewMode>('all')
  const [markingPayment, setMarkingPayment] = useState<string | null>(null)

  const fetchPayments = useCallback(async () => {
    setLoading(true)

    const [spaRes, eventRes] = await Promise.all([
      supabase
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
        .order('start_time', { ascending: false }),

      supabase
        .from('event_bookings')
        .select(`
          id,
          booker_name,
          booker_email,
          quantity,
          total_amount,
          payment_status,
          created_at,
          event:events(title)
        `)
        .order('created_at', { ascending: false }),
    ])

    if (!spaRes.error && spaRes.data) {
      setSpaBookings(spaRes.data.map(b => ({ ...b, type: 'spa' as const })) as unknown as SpaBooking[])
    }

    if (!eventRes.error && eventRes.data) {
      setEventPayments(
        eventRes.data.map((b) => {
          const eventData = b.event as { title: string } | { title: string }[] | null
          const eventTitle = Array.isArray(eventData) ? eventData[0]?.title : eventData?.title
          return {
            type: 'event' as const,
            id: b.id,
            event_title: eventTitle || 'Unknown Event',
            booker_name: b.booker_name,
            booker_email: b.booker_email,
            quantity: b.quantity,
            total_amount: b.total_amount,
            payment_status: b.payment_status,
            created_at: b.created_at,
          }
        })
      )
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    fetchPayments()
  }, [fetchPayments])

  const getSpaPaymentStatus = (booking: SpaBooking) => {
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

  const filteredSpaBookings = spaBookings.filter((booking) => {
    if (filter === 'all') return true
    const payment = getSpaPaymentStatus(booking)
    return payment.status === filter
  })

  const filteredEventPayments = eventPayments.filter((payment) => {
    if (filter === 'all') return true
    if (filter === 'fully_paid') return payment.payment_status === 'paid'
    if (filter === 'pending') return payment.payment_status === 'pending'
    return false
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
      fetchPayments()
    }
    setMarkingPayment(null)
  }

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: 'bg-amber-100 text-amber-800',
      deposit_paid: 'bg-blue-100 text-blue-800',
      fully_paid: 'bg-green-100 text-green-800',
      paid: 'bg-green-100 text-green-800',
    }
    return styles[status] || 'bg-gray-100 text-gray-800'
  }

  const formatStatus = (status: string) => {
    return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  }

  const spaStats = {
    totalReceived: spaBookings.reduce((sum, b) => {
      const payment = getSpaPaymentStatus(b)
      return sum + payment.totalPaid
    }, 0),
    pendingBalance: spaBookings.reduce((sum, b) => {
      const payment = getSpaPaymentStatus(b)
      return sum + payment.balanceDue
    }, 0),
    fullyPaid: spaBookings.filter(b => getSpaPaymentStatus(b).status === 'fully_paid').length,
    awaitingBalance: spaBookings.filter(b => getSpaPaymentStatus(b).status === 'deposit_paid').length,
  }

  const eventStats = {
    totalReceived: eventPayments
      .filter(p => p.payment_status === 'paid')
      .reduce((sum, p) => sum + p.total_amount, 0),
    pendingAmount: eventPayments
      .filter(p => p.payment_status === 'pending')
      .reduce((sum, p) => sum + p.total_amount, 0),
    paidCount: eventPayments.filter(p => p.payment_status === 'paid').length,
    pendingCount: eventPayments.filter(p => p.payment_status === 'pending').length,
  }

  const combinedStats = {
    totalReceived: spaStats.totalReceived + eventStats.totalReceived,
    pendingBalance: spaStats.pendingBalance + eventStats.pendingAmount,
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
            <p className="text-lg sm:text-2xl font-bold text-green-700 mt-1">R{combinedStats.totalReceived.toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm">
            <p className="text-xs sm:text-sm font-medium text-gray-600">Pending Amount</p>
            <p className="text-lg sm:text-2xl font-bold text-amber-700 mt-1">R{combinedStats.pendingBalance.toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm">
            <p className="text-xs sm:text-sm font-medium text-gray-600">Spa Payments</p>
            <p className="text-lg sm:text-2xl font-bold text-gray-900 mt-1">R{spaStats.totalReceived.toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm">
            <p className="text-xs sm:text-sm font-medium text-gray-600">Event Payments</p>
            <p className="text-lg sm:text-2xl font-bold text-gray-900 mt-1">R{eventStats.totalReceived.toLocaleString()}</p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm">
          <div className="p-4 border-b flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
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
            <div className="flex gap-2">
              {([
                { value: 'all', label: 'All Types' },
                { value: 'spa', label: 'Spa' },
                { value: 'events', label: 'Events' },
              ] as { value: ViewMode; label: string }[]).map((mode) => (
                <button
                  key={mode.value}
                  onClick={() => setViewMode(mode.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    viewMode === mode.value
                      ? 'bg-gray-200 text-gray-900'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-600">Loading payments...</div>
          ) : (
            <>
              {(viewMode === 'all' || viewMode === 'spa') && filteredSpaBookings.length > 0 && (
                <div>
                  {viewMode === 'all' && (
                    <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
                      <h3 className="text-sm font-semibold text-gray-700">Spa Bookings</h3>
                    </div>
                  )}
                  <div className="hidden lg:block overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Client</th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Service</th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Date</th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Total</th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Deposit</th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Balance Due</th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {filteredSpaBookings.map((booking) => {
                          const payment = getSpaPaymentStatus(booking)
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
                                <p className="text-gray-900">{new Date(booking.start_time).toLocaleDateString('en-ZA')}</p>
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
                    {filteredSpaBookings.map((booking) => {
                      const payment = getSpaPaymentStatus(booking)
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
                </div>
              )}

              {(viewMode === 'all' || viewMode === 'events') && filteredEventPayments.length > 0 && (
                <div>
                  {viewMode === 'all' && (
                    <div className="px-6 py-3 bg-gray-50 border-b border-t border-gray-200">
                      <h3 className="text-sm font-semibold text-gray-700">Event Bookings</h3>
                    </div>
                  )}
                  <div className="hidden lg:block overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Customer</th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Event</th>
                          <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Qty</th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Total</th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Booked</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {filteredEventPayments.map((payment) => (
                          <tr key={payment.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4">
                              <p className="font-medium text-gray-900">{payment.booker_name}</p>
                              <p className="text-sm text-gray-600">{payment.booker_email}</p>
                            </td>
                            <td className="px-6 py-4">
                              <p className="text-gray-900">{payment.event_title}</p>
                            </td>
                            <td className="px-6 py-4 text-center">
                              <p className="text-gray-900">{payment.quantity}</p>
                            </td>
                            <td className="px-6 py-4">
                              <p className="font-medium text-gray-900">R{payment.total_amount.toLocaleString()}</p>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`px-2 py-1 text-xs rounded-full ${getStatusBadge(payment.payment_status)}`}>
                                {formatStatus(payment.payment_status)}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <p className="text-sm text-gray-600">{new Date(payment.created_at).toLocaleDateString('en-ZA')}</p>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="lg:hidden divide-y divide-gray-200">
                    {filteredEventPayments.map((payment) => (
                      <div key={payment.id} className="p-4">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-gray-900 truncate">{payment.booker_name}</p>
                            <p className="text-sm text-gray-600">{payment.event_title}</p>
                          </div>
                          <span className={`px-2 py-1 text-xs rounded-full shrink-0 ${getStatusBadge(payment.payment_status)}`}>
                            {formatStatus(payment.payment_status)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <p className="text-gray-600">{payment.quantity} guest(s)</p>
                          <p className="font-medium text-gray-900">R{payment.total_amount.toLocaleString()}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {filteredSpaBookings.length === 0 && filteredEventPayments.length === 0 && (
                <div className="p-8 text-center text-gray-600">No payments found.</div>
              )}

              {viewMode === 'spa' && filteredSpaBookings.length === 0 && (
                <div className="p-8 text-center text-gray-600">No spa payments found.</div>
              )}

              {viewMode === 'events' && filteredEventPayments.length === 0 && (
                <div className="p-8 text-center text-gray-600">No event payments found.</div>
              )}
            </>
          )}
        </div>
      </div>
    </AdminLayout>
  )
}
