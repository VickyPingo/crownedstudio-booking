'use client'

import { AdminLayout } from '@/components/admin/AdminLayout'
import { BookingDetailDrawer } from '@/components/admin/BookingDetailDrawer'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'

interface Booking {
  id: string
  people_count: number
  status: string
  start_time: string
  total_price: number
  deposit_due: number
  room_id: string | null
  customer: {
    full_name: string
    email: string | null
  } | null
  service: {
    name: string
  } | null
  room: {
    room_name: string
    room_area: string
  } | null
  payment_transactions: {
    status: string
    amount: number
  }[]
}

type FilterStatus = 'all' | 'pending_payment' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'

const STATUS_FILTERS: { value: FilterStatus; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending_payment', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'no_show', label: 'No-show' },
]

export default function AdminBookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterStatus>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null)

  const fetchBookings = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('bookings')
      .select(`
        id,
        people_count,
        status,
        start_time,
        total_price,
        deposit_due,
        room_id,
        customer:customers(full_name, email),
        service:services(name),
        room:rooms(room_name, room_area),
        payment_transactions(status, amount)
      `)
      .order('start_time', { ascending: false })

    if (filter !== 'all') {
      query = query.eq('status', filter)
    }

    const { data, error } = await query

    if (!error && data) {
      setBookings(data as unknown as Booking[])
    }
    setLoading(false)
  }, [filter])

  useEffect(() => {
    fetchBookings()
  }, [fetchBookings])

  const filteredBookings = bookings.filter((booking) => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      booking.customer?.full_name?.toLowerCase().includes(query) ||
      booking.customer?.email?.toLowerCase().includes(query) ||
      booking.service?.name?.toLowerCase().includes(query)
    )
  })

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending_payment: 'bg-amber-100 text-amber-800',
      confirmed: 'bg-blue-100 text-blue-800',
      completed: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800',
      cancelled_expired: 'bg-gray-100 text-gray-800',
      expired: 'bg-gray-100 text-gray-800',
      no_show: 'bg-gray-200 text-gray-700',
    }
    return styles[status] || 'bg-gray-100 text-gray-800'
  }

  const getPaymentStatus = (booking: Booking) => {
    const completedPayments = booking.payment_transactions?.filter(p => p.status === 'complete') || []
    const totalPaid = completedPayments.reduce((sum, p) => sum + (p.amount || 0), 0)

    if (totalPaid >= booking.total_price) {
      return { label: 'Paid', style: 'bg-green-100 text-green-800' }
    } else if (totalPaid > 0) {
      return { label: 'Deposit', style: 'bg-blue-100 text-blue-800' }
    }
    return { label: 'Pending', style: 'bg-amber-100 text-amber-800' }
  }

  const formatStatus = (status: string) => {
    return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bookings</h1>
          <p className="text-gray-600 mt-1">Manage all your spa bookings.</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm">
          <div className="p-4 border-b flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
            <div className="flex gap-2 flex-wrap">
              {STATUS_FILTERS.map((status) => (
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
            <div className="relative">
              <input
                type="text"
                placeholder="Search bookings..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full sm:w-64 px-4 py-2 pl-10 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              />
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-600">Loading bookings...</div>
          ) : filteredBookings.length === 0 ? (
            <div className="p-8 text-center text-gray-600">No bookings found.</div>
          ) : (
            <div className="overflow-x-auto">
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
                      Room
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Date & Time
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Payment
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredBookings.map((booking) => {
                    const paymentStatus = getPaymentStatus(booking)
                    return (
                      <tr
                        key={booking.id}
                        onClick={() => setSelectedBookingId(booking.id)}
                        className="hover:bg-gray-50 cursor-pointer"
                      >
                        <td className="px-6 py-4">
                          <div>
                            <p className="font-medium text-gray-900">{booking.customer?.full_name}</p>
                            <p className="text-sm text-gray-600">{booking.customer?.email}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-gray-900">{booking.service?.name}</p>
                          <p className="text-sm text-gray-600">{booking.people_count} person(s)</p>
                        </td>
                        <td className="px-6 py-4">
                          {booking.room ? (
                            <span className="text-gray-900">{booking.room.room_name}</span>
                          ) : (
                            <span className="text-gray-400 text-sm">Unassigned</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-gray-900">
                            {new Date(booking.start_time).toLocaleDateString('en-ZA')}
                          </p>
                          <p className="text-sm text-gray-600">
                            {new Date(booking.start_time).toLocaleTimeString('en-ZA', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="font-medium text-gray-900">R{booking.total_price?.toLocaleString()}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 text-xs rounded-full ${getStatusBadge(booking.status)}`}>
                            {formatStatus(booking.status)}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 text-xs rounded-full ${paymentStatus.style}`}>
                            {paymentStatus.label}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <BookingDetailDrawer
        bookingId={selectedBookingId}
        onClose={() => setSelectedBookingId(null)}
        onUpdate={fetchBookings}
      />
    </AdminLayout>
  )
}
