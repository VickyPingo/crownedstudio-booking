'use client'

import { AdminLayout } from '@/components/admin/AdminLayout'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

interface DashboardStats {
  todayBookings: number
  pendingPayments: number
  totalClients: number
  monthlyRevenue: number
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    todayBookings: 0,
    pendingPayments: 0,
    totalClients: 0,
    monthlyRevenue: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const today = new Date().toISOString().split('T')[0]
        const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()

        const [bookingsToday, pendingPayments, clients, monthlyPayments] = await Promise.all([
          supabase
            .from('bookings')
            .select('id', { count: 'exact' })
            .eq('booking_date', today),
          supabase
            .from('bookings')
            .select('id', { count: 'exact' })
            .eq('payment_status', 'pending'),
          supabase
            .from('bookings')
            .select('client_email')
            .not('client_email', 'is', null),
          supabase
            .from('payment_transactions')
            .select('amount')
            .eq('status', 'completed')
            .gte('created_at', startOfMonth),
        ])

        const uniqueClients = new Set(clients.data?.map(b => b.client_email) || [])
        const totalRevenue = monthlyPayments.data?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0

        setStats({
          todayBookings: bookingsToday.count || 0,
          pendingPayments: pendingPayments.count || 0,
          totalClients: uniqueClients.size,
          monthlyRevenue: totalRevenue,
        })
      } catch (error) {
        console.error('Error fetching dashboard stats:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [])

  return (
    <AdminLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600 mt-1">Welcome back. Here is your overview for today.</p>
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
            <div className="space-y-3">
              <QuickActionButton href="/admin/bookings" label="View All Bookings" />
              <QuickActionButton href="/admin/calendar" label="Open Calendar" />
              <QuickActionButton href="/admin/payments" label="Check Payments" />
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h2>
            <p className="text-gray-600 text-sm">Activity feed will appear here once bookings are made.</p>
          </div>
        </div>
      </div>
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
    <div className="bg-white rounded-xl p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
        </div>
        <div className={`p-3 rounded-lg ${color}`}>
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
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
