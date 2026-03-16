'use client'

import { useState, useEffect } from 'react'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { supabase } from '@/lib/supabase/client'
import Link from 'next/link'

interface EventWithStats {
  id: string
  title: string
  slug: string
  event_date: string
  price_per_person: number
  is_active: boolean
  created_at: string
  total_bookings: number
  total_guests: number
  paid_revenue: number
}

export default function AdminEventsPage() {
  const [events, setEvents] = useState<EventWithStats[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchEvents()
  }, [])

  async function fetchEvents() {
    const { data: eventsData, error: eventsError } = await supabase
      .from('events')
      .select('*')
      .order('event_date', { ascending: false })

    if (eventsError) {
      console.error('Error fetching events:', eventsError)
      setLoading(false)
      return
    }

    const eventsWithStats: EventWithStats[] = await Promise.all(
      (eventsData || []).map(async (event) => {
        const { data: bookings } = await supabase
          .from('event_bookings')
          .select('quantity, total_amount, payment_status')
          .eq('event_id', event.id)

        const totalBookings = bookings?.length || 0
        const totalGuests = bookings?.reduce((sum, b) => sum + b.quantity, 0) || 0
        const paidRevenue = bookings
          ?.filter(b => b.payment_status === 'paid')
          .reduce((sum, b) => sum + b.total_amount, 0) || 0

        return {
          ...event,
          total_bookings: totalBookings,
          total_guests: totalGuests,
          paid_revenue: paidRevenue,
        }
      })
    )

    setEvents(eventsWithStats)
    setLoading(false)
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-ZA', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const isPastEvent = (dateStr: string) => {
    return new Date(dateStr) < new Date()
  }

  return (
    <AdminLayout>
      <div className="p-6 lg:p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Events</h1>
            <p className="text-gray-600 mt-1">Manage special events and their bookings</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
          </div>
        ) : events.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Events Yet</h3>
            <p className="text-gray-600">Events will appear here once created in the database.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-6 py-4 text-sm font-semibold text-gray-900">Event</th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-gray-900">Date</th>
                    <th className="text-right px-6 py-4 text-sm font-semibold text-gray-900">Price</th>
                    <th className="text-center px-6 py-4 text-sm font-semibold text-gray-900">Status</th>
                    <th className="text-right px-6 py-4 text-sm font-semibold text-gray-900">Bookings</th>
                    <th className="text-right px-6 py-4 text-sm font-semibold text-gray-900">Guests</th>
                    <th className="text-right px-6 py-4 text-sm font-semibold text-gray-900">Revenue</th>
                    <th className="text-right px-6 py-4 text-sm font-semibold text-gray-900"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {events.map((event) => (
                    <tr key={event.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-medium text-gray-900">{event.title}</p>
                          <p className="text-sm text-gray-500">{event.slug}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={isPastEvent(event.event_date) ? 'text-gray-400' : 'text-gray-900'}>
                          {formatDate(event.event_date)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-gray-900 font-medium">R{event.price_per_person}</span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {event.is_active ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                            Inactive
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-gray-900 font-medium">{event.total_bookings}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-gray-900 font-medium">{event.total_guests}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-gray-900 font-medium">R{event.paid_revenue.toLocaleString()}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link
                          href={`/admin/events/${event.id}`}
                          className="text-sm font-medium text-gray-700 hover:text-gray-900"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
