'use client'

import { useState, useEffect, use } from 'react'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { supabase } from '@/lib/supabase/client'
import Link from 'next/link'
import type { Event, EventBooking } from '@/types/event'

interface EventDetailPageProps {
  params: Promise<{ id: string }>
}

interface EventStats {
  totalBookings: number
  totalGuests: number
  paidRevenue: number
  pendingBookings: number
}

export default function EventDetailPage({ params }: EventDetailPageProps) {
  const { id } = use(params)
  const [event, setEvent] = useState<Event | null>(null)
  const [bookings, setBookings] = useState<EventBooking[]>([])
  const [stats, setStats] = useState<EventStats>({
    totalBookings: 0,
    totalGuests: 0,
    paidRevenue: 0,
    pendingBookings: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchEventAndBookings()
  }, [id])

  async function fetchEventAndBookings() {
    const { data: eventData, error: eventError } = await supabase
      .from('events')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (eventError || !eventData) {
      console.error('Error fetching event:', eventError)
      setLoading(false)
      return
    }

    setEvent(eventData)

    const { data: bookingsData, error: bookingsError } = await supabase
      .from('event_bookings')
      .select('*')
      .eq('event_id', id)
      .order('created_at', { ascending: false })

    if (bookingsError) {
      console.error('Error fetching bookings:', bookingsError)
    } else {
      setBookings(bookingsData || [])

      const totalBookings = bookingsData?.length || 0
      const totalGuests = bookingsData?.reduce((sum, b) => sum + b.quantity, 0) || 0
      const paidRevenue = bookingsData
        ?.filter(b => b.payment_status === 'paid')
        .reduce((sum, b) => sum + b.total_amount, 0) || 0
      const pendingBookings = bookingsData?.filter(b => b.payment_status === 'pending').length || 0

      setStats({
        totalBookings,
        totalGuests,
        paidRevenue,
        pendingBookings,
      })
    }

    setLoading(false)
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-ZA', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatShortDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-ZA', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getPaymentStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">Paid</span>
      case 'pending':
        return <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">Pending</span>
      default:
        return <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">{status}</span>
    }
  }

  const getBookingStatusBadge = (status: string) => {
    switch (status) {
      case 'confirmed':
        return <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">Confirmed</span>
      case 'pending':
        return <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">Pending</span>
      case 'cancelled':
        return <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">Cancelled</span>
      default:
        return <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">{status}</span>
    }
  }

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-24">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        </div>
      </AdminLayout>
    )
  }

  if (!event) {
    return (
      <AdminLayout>
        <div className="p-6 lg:p-8">
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Event Not Found</h3>
            <p className="text-gray-600 mb-4">The event you&apos;re looking for doesn&apos;t exist.</p>
            <Link href="/admin/events" className="text-gray-700 hover:text-gray-900 font-medium">
              Back to Events
            </Link>
          </div>
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout>
      <div className="p-6 lg:p-8">
        <div className="mb-6">
          <Link href="/admin/events" className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Events
          </Link>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-2xl font-bold text-gray-900">{event.title}</h1>
                {event.is_active ? (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">Active</span>
                ) : (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">Inactive</span>
                )}
              </div>
              <p className="text-gray-600 mb-2">{formatDate(event.event_date)}</p>
              {event.description && (
                <p className="text-gray-500 text-sm">{event.description}</p>
              )}
            </div>
            <div className="text-left lg:text-right">
              <p className="text-sm text-gray-500">Price per person</p>
              <p className="text-2xl font-bold text-gray-900">R{event.price_per_person}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm text-gray-500 mb-1">Total Bookings</p>
            <p className="text-2xl font-bold text-gray-900">{stats.totalBookings}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm text-gray-500 mb-1">Total Guests</p>
            <p className="text-2xl font-bold text-gray-900">{stats.totalGuests}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm text-gray-500 mb-1">Paid Revenue</p>
            <p className="text-2xl font-bold text-green-700">R{stats.paidRevenue.toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm text-gray-500 mb-1">Pending Bookings</p>
            <p className="text-2xl font-bold text-amber-600">{stats.pendingBookings}</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Bookings</h2>
          </div>

          {bookings.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <p className="text-gray-600">No bookings yet for this event.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Customer</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Contact</th>
                    <th className="text-center px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Qty</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Voucher</th>
                    <th className="text-right px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Total</th>
                    <th className="text-center px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Payment</th>
                    <th className="text-center px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Booked</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {bookings.map((booking) => (
                    <tr key={booking.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <p className="font-medium text-gray-900">{booking.booker_name}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-gray-900">{booking.booker_email}</p>
                        <p className="text-sm text-gray-500">{booking.booker_phone}</p>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="font-medium text-gray-900">{booking.quantity}</span>
                      </td>
                      <td className="px-6 py-4">
                        {booking.voucher_code ? (
                          <div>
                            <p className="text-sm font-mono text-gray-900">{booking.voucher_code}</p>
                            <p className="text-xs text-green-700">-R{booking.voucher_discount}</p>
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="font-medium text-gray-900">R{booking.total_amount}</span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {getPaymentStatusBadge(booking.payment_status)}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {getBookingStatusBadge(booking.booking_status)}
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-500">{formatShortDate(booking.created_at)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  )
}
