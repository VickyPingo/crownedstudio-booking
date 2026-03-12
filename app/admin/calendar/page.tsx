'use client'

import { AdminLayout } from '@/components/admin/AdminLayout'
import { BookingDetailDrawer } from '@/components/admin/BookingDetailDrawer'
import { TimeBlockModal } from '@/components/admin/TimeBlockModal'
import { ManualBookingModal } from '@/components/admin/ManualBookingModal'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import type { TimeBlock } from '@/types/admin'

interface Booking {
  id: string
  status: string
  start_time: string
  people_count: number
  customer: {
    full_name: string
  } | null
  service: {
    name: string
  } | null
  payment_transactions: {
    status: string
  }[]
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export default function AdminCalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [bookings, setBookings] = useState<Booking[]>([])
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null)
  const [showBlockModal, setShowBlockModal] = useState(false)
  const [blockDate, setBlockDate] = useState<string | null>(null)
  const [editingBlock, setEditingBlock] = useState<TimeBlock | null>(null)
  const [showManualBooking, setShowManualBooking] = useState(false)
  const [manualBookingDate, setManualBookingDate] = useState<string | null>(null)

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const fetchData = useCallback(async () => {
    setLoading(true)
    const startOfMonth = new Date(year, month, 1).toISOString().split('T')[0]
    const endOfMonth = new Date(year, month + 1, 0).toISOString().split('T')[0]

    const [bookingsRes, blocksRes] = await Promise.all([
      supabase
        .from('bookings')
        .select(`
          id,
          status,
          start_time,
          people_count,
          customer:customers(full_name),
          service:services(name),
          payment_transactions(status)
        `)
        .gte('start_time', `${startOfMonth}T00:00:00`)
        .lte('start_time', `${endOfMonth}T23:59:59`)
        .order('start_time'),
      supabase
        .from('time_blocks')
        .select('*')
        .gte('block_date', startOfMonth)
        .lte('block_date', endOfMonth)
        .order('block_date'),
    ])

    if (!bookingsRes.error && bookingsRes.data) {
      setBookings(bookingsRes.data as unknown as Booking[])
    }
    if (!blocksRes.error && blocksRes.data) {
      setTimeBlocks(blocksRes.data)
    }
    setLoading(false)
  }, [year, month])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const getDaysInMonth = () => {
    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const days: (number | null)[] = []

    for (let i = 0; i < firstDay; i++) {
      days.push(null)
    }

    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i)
    }

    return days
  }

  const getBookingsForDate = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return bookings.filter((b) => b.start_time.startsWith(dateStr))
  }

  const getBlocksForDate = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return timeBlocks.filter((b) => b.block_date === dateStr)
  }

  const isDateBlocked = (day: number) => {
    const blocks = getBlocksForDate(day)
    return blocks.some(b => b.is_full_day)
  }

  const goToPrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1))
    setSelectedDate(null)
  }

  const goToNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1))
    setSelectedDate(null)
  }

  const goToToday = () => {
    setCurrentDate(new Date())
  }

  const handleEditBlock = (block: TimeBlock) => {
    setBlockDate(block.block_date)
    setEditingBlock(block)
    setShowBlockModal(true)
  }

  const handleCloseBlockModal = () => {
    setShowBlockModal(false)
    setBlockDate(null)
    setEditingBlock(null)
  }

  const today = new Date()
  const isToday = (day: number) =>
    day === today.getDate() && month === today.getMonth() && year === today.getFullYear()

  const selectedDateBookings = selectedDate
    ? bookings.filter((b) => b.start_time.startsWith(selectedDate))
    : []

  const selectedDateBlocks = selectedDate
    ? timeBlocks.filter((b) => b.block_date === selectedDate)
    : []

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending_payment: 'bg-amber-100 text-amber-800',
      confirmed: 'bg-blue-100 text-blue-800',
      completed: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800',
      no_show: 'bg-gray-200 text-gray-700',
    }
    return styles[status] || 'bg-gray-100 text-gray-800'
  }

  const formatStatus = (status: string) => {
    return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Calendar</h1>
            <p className="text-gray-600 mt-1">View and manage your booking schedule.</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => {
                const todayStr = new Date().toISOString().split('T')[0]
                setBlockDate(todayStr)
                setShowBlockModal(true)
              }}
              className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
            >
              Block Time
            </button>
            <button
              onClick={() => {
                setManualBookingDate(null)
                setShowManualBooking(true)
              }}
              className="px-4 py-2 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Booking
            </button>
            <button
              onClick={goToToday}
              className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
            >
              Today
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b">
            <button
              onClick={goToPrevMonth}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h2 className="text-lg font-semibold text-gray-900">
              {MONTHS[month]} {year}
            </h2>
            <button
              onClick={goToNextMonth}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-600">Loading calendar...</div>
          ) : (
            <div className="p-4">
              <div className="grid grid-cols-7 gap-1 mb-2">
                {DAYS.map((day) => (
                  <div key={day} className="text-center text-sm font-medium text-gray-600 py-2">
                    {day}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {getDaysInMonth().map((day, idx) => {
                  if (day === null) {
                    return <div key={`empty-${idx}`} className="h-24" />
                  }

                  const dayBookings = getBookingsForDate(day)
                  const dayBlocks = getBlocksForDate(day)
                  const hasFullDayBlock = dayBlocks.some(b => b.is_full_day)
                  const hasPartialBlock = dayBlocks.some(b => !b.is_full_day)
                  const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`

                  return (
                    <button
                      key={day}
                      onClick={() => setSelectedDate(dateStr)}
                      className={`h-24 p-2 border rounded-lg text-left transition-colors relative ${
                        hasFullDayBlock
                          ? 'bg-gray-200 border-gray-300'
                          : isToday(day)
                          ? 'bg-gray-900 text-white border-gray-900'
                          : selectedDate === dateStr
                          ? 'bg-gray-100 border-gray-300'
                          : 'bg-white border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <span className={`text-sm font-medium ${
                        hasFullDayBlock ? 'text-gray-500' :
                        isToday(day) ? 'text-white' : 'text-gray-900'
                      }`}>
                        {day}
                      </span>
                      {hasFullDayBlock && (
                        <div className="mt-1">
                          <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-gray-400 text-white">
                            Blocked
                          </span>
                        </div>
                      )}
                      {hasPartialBlock && !hasFullDayBlock && (
                        <div className="absolute top-1 right-1 w-2 h-2 bg-gray-400 rounded-full" />
                      )}
                      {dayBookings.length > 0 && !hasFullDayBlock && (
                        <div className="mt-1">
                          <span
                            className={`inline-block px-2 py-0.5 text-xs rounded-full ${
                              isToday(day) ? 'bg-white text-gray-900' : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {dayBookings.length} booking{dayBookings.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {selectedDate && (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-ZA', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </h3>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setManualBookingDate(selectedDate)
                    setShowManualBooking(true)
                  }}
                  className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors flex items-center gap-1"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Booking
                </button>
                <button
                  onClick={() => {
                    setBlockDate(selectedDate)
                    setShowBlockModal(true)
                  }}
                  className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Block Time
                </button>
              </div>
            </div>

            {selectedDateBlocks.length > 0 && (
              <div className="mb-4 space-y-2">
                <p className="text-sm font-medium text-gray-700">Time Blocks</p>
                {selectedDateBlocks.map((block) => (
                  <button
                    key={block.id}
                    onClick={() => handleEditBlock(block)}
                    className="w-full flex items-center justify-between p-3 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors text-left"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-800">
                        {block.is_full_day
                          ? 'Full day blocked'
                          : `${block.start_time?.slice(0, 5)} - ${block.end_time?.slice(0, 5)}`}
                      </p>
                      {block.reason && (
                        <p className="text-xs text-gray-600">{block.reason}</p>
                      )}
                    </div>
                    <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                ))}
              </div>
            )}

            {selectedDateBookings.length === 0 ? (
              <p className="text-gray-600">No bookings for this date.</p>
            ) : (
              <div className="space-y-3">
                {selectedDateBookings.map((booking) => (
                  <button
                    key={booking.id}
                    onClick={() => setSelectedBookingId(booking.id)}
                    className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors text-left"
                  >
                    <div>
                      <p className="font-medium text-gray-900">{booking.service?.name}</p>
                      <p className="text-sm text-gray-600">
                        {booking.customer?.full_name} at{' '}
                        {new Date(booking.start_time).toLocaleTimeString('en-ZA', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <span className={`px-2 py-1 text-xs rounded-full ${getStatusBadge(booking.status)}`}>
                        {formatStatus(booking.status)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <BookingDetailDrawer
        bookingId={selectedBookingId}
        onClose={() => setSelectedBookingId(null)}
        onUpdate={fetchData}
      />

      {showBlockModal && blockDate && (
        <TimeBlockModal
          selectedDate={blockDate}
          existingBlock={editingBlock}
          onClose={handleCloseBlockModal}
          onSave={fetchData}
        />
      )}

      {showManualBooking && (
        <ManualBookingModal
          onClose={() => {
            setShowManualBooking(false)
            setManualBookingDate(null)
          }}
          onSuccess={() => {
            setShowManualBooking(false)
            setManualBookingDate(null)
            fetchData()
          }}
          prefillDate={manualBookingDate}
        />
      )}
    </AdminLayout>
  )
}
