'use client'

import { AdminLayout } from '@/components/admin/AdminLayout'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'

interface Client {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  bookingCount: number
  totalSpent: number
  lastBooking: string | null
}

export default function AdminClientsPage() {
  const router = useRouter()
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    const fetchClients = async () => {
      setLoading(true)

      const { data: customers, error: customersError } = await supabase
        .from('customers')
        .select('id, full_name, email, phone')

      if (customersError || !customers) {
        setLoading(false)
        return
      }

      const { data: bookings, error: bookingsError } = await supabase
        .from('bookings')
        .select(`
          customer_id,
          total_price,
          start_time,
          payment_transactions(status, amount)
        `)
        .order('start_time', { ascending: false })

      if (bookingsError) {
        setLoading(false)
        return
      }

      const clientMap = new Map<string, Client>()

      customers.forEach((customer) => {
        clientMap.set(customer.id, {
          id: customer.id,
          full_name: customer.full_name,
          email: customer.email,
          phone: customer.phone,
          bookingCount: 0,
          totalSpent: 0,
          lastBooking: null,
        })
      })

      bookings?.forEach((booking) => {
        const client = clientMap.get(booking.customer_id)
        if (!client) return

        client.bookingCount += 1

        const paid = (booking.payment_transactions as { status: string; amount: number }[])
          ?.filter(p => p.status === 'complete')
          .reduce((sum, p) => sum + (p.amount || 0), 0) || 0
        client.totalSpent += paid

        if (!client.lastBooking || booking.start_time > client.lastBooking) {
          client.lastBooking = booking.start_time
        }
      })

      const clientList = Array.from(clientMap.values())
        .filter(c => c.bookingCount > 0)
        .sort((a, b) => b.bookingCount - a.bookingCount)

      setClients(clientList)
      setLoading(false)
    }

    fetchClients()
  }, [])

  const filteredClients = clients.filter((client) => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      client.full_name?.toLowerCase().includes(query) ||
      client.email?.toLowerCase().includes(query) ||
      client.phone?.includes(query)
    )
  })

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
          <p className="text-gray-600 mt-1">View all clients who have made bookings.</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm">
          <div className="p-4 border-b flex items-center justify-between">
            <p className="text-sm text-gray-600">{filteredClients.length} clients</p>
            <div className="relative">
              <input
                type="text"
                placeholder="Search clients..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-64 px-4 py-2 pl-10 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-gray-900 focus:border-transparent"
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
            <div className="p-8 text-center text-gray-600">Loading clients...</div>
          ) : filteredClients.length === 0 ? (
            <div className="p-8 text-center text-gray-600">No clients found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Client
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Contact
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Bookings
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Total Spent
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Last Booking
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredClients.map((client) => (
                    <tr
                      key={client.id}
                      onClick={() => router.push(`/admin/clients/${client.id}`)}
                      className="hover:bg-gray-50 cursor-pointer"
                    >
                      <td className="px-6 py-4">
                        <p className="font-medium text-gray-900">{client.full_name}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-gray-900">{client.email || '-'}</p>
                        <p className="text-sm text-gray-600">{client.phone || '-'}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {client.bookingCount} booking{client.bookingCount !== 1 ? 's' : ''}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-medium text-gray-900">R{client.totalSpent.toLocaleString()}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-gray-900">
                          {client.lastBooking
                            ? new Date(client.lastBooking).toLocaleDateString('en-ZA')
                            : '-'}
                        </p>
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
