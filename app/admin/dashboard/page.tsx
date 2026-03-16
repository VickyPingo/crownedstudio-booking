'use client'

import { AdminLayout } from '@/components/admin/AdminLayout'
import { ManualBookingModal } from '@/components/admin/ManualBookingModal'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'

interface DashboardStats {
  todayBookings: number
  pendingPayments: number
  totalClients: number
  monthlyRevenue: number
}

interface Room {
  id: string
  room_name: string
  room_area: string
  capacity: number
  priority: number
  active: boolean
}

interface RoomBooking {
  id: string
  room_id: string | null
  start_time: string
  end_time: string
  status: string
  customer: { full_name: string } | null
  service: { name: string } | null
}

interface RoomStatus {
  room: Room
  currentBooking: RoomBooking | null
  nextBooking: RoomBooking | null
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    todayBookings: 0,
    pendingPayments: 0,
    totalClients: 0,
    monthlyRevenue: 0,
  })
  const [loading, setLoading] = useState(true)
  const [showManualBooking, setShowManualBooking] = useState(false)
  const [roomStatuses, setRoomStatuses] = useState<RoomStatus[]>([])
  const [unassignedBookings, setUnassignedBookings] = useState<RoomBooking[]>([])
  const [roomsLoading, setRoomsLoading] = useState(true)

  const fetchStats = useCallback(async () => {
    try {
      const today = new Date()
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString()
      const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString()
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString()

      const [bookingsToday, pendingPayments, clients, monthlyPayments] = await Promise.all([
        supabase
          .from('bookings')
          .select('id', { count: 'exact' })
          .gte('start_time', todayStart)
          .lt('start_time', todayEnd)
          .in('status', ['confirmed', 'completed']),
        supabase
          .from('payment_transactions')
          .select('booking_id', { count: 'exact' })
          .eq('status', 'pending'),
        supabase
          .from('customers')
          .select('id', { count: 'exact' }),
        supabase
          .from('payment_transactions')
          .select('amount')
          .eq('status', 'complete')
          .gte('created_at', startOfMonth),
      ])

      const totalRevenue = monthlyPayments.data?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0

      setStats({
        todayBookings: bookingsToday.count || 0,
        pendingPayments: pendingPayments.count || 0,
        totalClients: clients.count || 0,
        monthlyRevenue: totalRevenue,
      })
    } catch (error) {
      console.error('Error fetching dashboard stats:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchRoomStatuses = useCallback(async () => {
    setRoomsLoading(true)
    try {
      const now = new Date()
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
      const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString()

      const { data: rooms } = await supabase
        .from('rooms')
        .select('*')
        .eq('active', true)
        .order('priority', { ascending: true })

      const { data: todayBookings } = await supabase
        .from('bookings')
        .select(`
          id,
          room_id,
          start_time,
          end_time,
          status,
          customer:customers(full_name),
          service:services(name)
        `)
        .gte('start_time', todayStart)
        .lt('start_time', todayEnd)
        .in('status', ['confirmed', 'completed'])
        .order('start_time', { ascending: true })

      const bookings = (todayBookings || []) as unknown as RoomBooking[]
      const unassigned = bookings.filter(b => !b.room_id)
      setUnassignedBookings(unassigned)

      const statuses: RoomStatus[] = (rooms || []).map((room: Room) => {
        const roomBookings = bookings.filter(b => b.room_id === room.id)

        let currentBooking: RoomBooking | null = null
        let nextBooking: RoomBooking | null = null

        for (const booking of roomBookings) {
          const start = new Date(booking.start_time)
          const end = new Date(booking.end_time)

          if (now >= start && now < end) {
            currentBooking = booking
          } else if (start > now && !nextBooking) {
            nextBooking = booking
          }
        }

        return { room, currentBooking, nextBooking }
      })

      setRoomStatuses(statuses)
    } catch (error) {
      console.error('Error fetching room statuses:', error)
    } finally {
      setRoomsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStats()
    fetchRoomStatuses()
  }, [fetchStats, fetchRoomStatuses])

  return (
    <AdminLayout>
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-gray-600 mt-1 text-sm sm:text-base">Welcome back. Here is your overview for today.</p>
          </div>
          <button
            onClick={() => setShowManualBooking(true)}
            className="px-4 py-2.5 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors flex items-center justify-center gap-2 w-full sm:w-auto"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Booking
          </button>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white rounded-xl p-6 shadow-sm animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-24 mb-4" />
                <div className="h-8 bg-gray-200 rounded w-16" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
            <StatCard
              title="Today's Bookings"
              value={stats.todayBookings.toString()}
              icon="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              color="bg-blue-50 text-blue-700"
            />
            <StatCard
              title="Pending Payments"
              value={stats.pendingPayments.toString()}
              icon="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              color="bg-amber-50 text-amber-700"
            />
            <StatCard
              title="Total Clients"
              value={stats.totalClients.toString()}
              icon="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
              color="bg-green-50 text-green-700"
            />
            <StatCard
              title="Monthly Revenue"
              value={`R${stats.monthlyRevenue.toLocaleString()}`}
              icon="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
              color="bg-emerald-50 text-emerald-700"
            />
          </div>
        )}

        <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border-2 border-teal-500">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
            <div>
              <p className="text-xs font-bold text-teal-600 mb-1">ROOM OVERVIEW</p>
              <h2 className="text-lg font-semibold text-gray-900">Room Overview</h2>
            </div>
            <a href="/admin/rooms" className="text-sm text-gray-600 hover:text-gray-900">View Calendar</a>
          </div>

          {roomsLoading ? (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="bg-gray-50 rounded-lg p-3 sm:p-4 animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-20 mb-3" />
                  <div className="h-3 bg-gray-200 rounded w-full mb-2" />
                  <div className="h-3 bg-gray-200 rounded w-2/3" />
                </div>
              ))}
            </div>
          ) : roomStatuses.length === 0 ? (
            <p className="text-gray-600 text-sm">No active rooms found. Add rooms in the Rooms section.</p>
          ) : (
            <>
              {unassignedBookings.length > 0 && (
                <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-sm font-medium text-amber-800">
                    {unassignedBookings.length} unassigned booking{unassignedBookings.length !== 1 ? 's' : ''} today
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {unassignedBookings.slice(0, 3).map((booking) => (
                      <span key={booking.id} className="text-xs bg-white border border-amber-300 px-2 py-1 rounded">
                        {booking.customer?.full_name} - {new Date(booking.start_time).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    ))}
                    {unassignedBookings.length > 3 && (
                      <span className="text-xs text-amber-700">+{unassignedBookings.length - 3} more</span>
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
                {roomStatuses.map(({ room, currentBooking, nextBooking }) => (
                  <div
                    key={room.id}
                    className={`rounded-lg p-3 sm:p-4 border ${
                      currentBooking
                        ? 'bg-blue-50 border-blue-200'
                        : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-2">
                      <h3 className="font-semibold text-gray-900 text-sm sm:text-base truncate">{room.room_name}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full w-fit ${
                        room.room_area === 'public'
                          ? 'bg-teal-100 text-teal-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {room.room_area}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mb-2 sm:mb-3">Cap: {room.capacity}</p>

                    {currentBooking ? (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-blue-800">In Session</p>
                        <p className="text-xs sm:text-sm text-gray-900 truncate">{currentBooking.customer?.full_name}</p>
                        <p className="text-xs text-gray-600">
                          Until {new Date(currentBooking.end_time).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    ) : nextBooking ? (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-gray-600">Next</p>
                        <p className="text-xs sm:text-sm text-gray-900 truncate">{nextBooking.customer?.full_name}</p>
                        <p className="text-xs text-gray-600">
                          {new Date(nextBooking.start_time).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    ) : (
                      <p className="text-sm text-green-700">Available</p>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
            <div className="space-y-3">
              <button
                onClick={() => setShowManualBooking(true)}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors group"
              >
                <span className="font-medium">Create Manual Booking</span>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              </button>
              <QuickActionButton href="/admin/bookings" label="View All Bookings" />
              <QuickActionButton href="/admin/calendar" label="Open Calendar" />
              <QuickActionButton href="/admin/payments" label="Check Payments" />
            </div>
          </div>

          <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h2>
            <p className="text-gray-600 text-sm">Activity feed will appear here once bookings are made.</p>
          </div>
        </div>
      </div>

      {showManualBooking && (
        <ManualBookingModal
          onClose={() => setShowManualBooking(false)}
          onSuccess={() => {
            setShowManualBooking(false)
            fetchStats()
          }}
        />
      )}
    </AdminLayout>
  )
}

function StatCard({
  title,
  value,
  icon,
  color,
}: {
  title: string
  value: string
  icon: string
  color: string
}) {
  return (
    <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm">
      <div className="flex items-start sm:items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs sm:text-sm font-medium text-gray-600 truncate">{title}</p>
          <p className="text-lg sm:text-2xl font-bold text-gray-900 mt-1">{value}</p>
        </div>
        <div className={`p-2 sm:p-3 rounded-lg shrink-0 ${color}`}>
          <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
          </svg>
        </div>
      </div>
    </div>
  )
}

function QuickActionButton({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors group"
    >
      <span className="text-gray-800 font-medium">{label}</span>
      <svg
        className="w-5 h-5 text-gray-500 group-hover:text-gray-700 transition-colors"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </a>
  )
}
