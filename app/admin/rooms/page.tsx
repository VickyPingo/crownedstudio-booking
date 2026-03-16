'use client'

import { useState, useEffect } from 'react'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { BookingDetailDrawer } from '@/components/admin/BookingDetailDrawer'
import { supabase } from '@/lib/supabase/client'
import type { Room } from '@/types/admin'

interface RoomBooking {
  id: string
  start_time: string
  end_time: string
  room_id: string | null
  status: string
  people_count: number
  total_price: number
  customer: {
    full_name: string
  }
  service: {
    name: string
  }
  payment_transactions: {
    status: string
    amount: number
  }[]
}

const TIME_SLOTS = [
  '08:00', '08:30', '09:00', '09:30', '10:00', '10:30',
  '11:00', '11:30', '12:00', '12:30', '13:00', '13:30',
  '14:00', '14:30', '15:00', '15:30', '16:00', '16:30',
  '17:00', '17:30', '18:00', '18:30', '19:00', '19:30',
  '20:00'
]

function getPaymentStatus(booking: RoomBooking): 'paid' | 'pending' | 'partial' {
  const completedPayments = booking.payment_transactions?.filter(p => p.status === 'complete') || []
  const totalPaid = completedPayments.reduce((sum, p) => sum + (p.amount || 0), 0)

  if (totalPaid >= booking.total_price) return 'paid'
  if (totalPaid > 0) return 'partial'
  return 'pending'
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'confirmed':
      return 'bg-blue-100 border-blue-300 text-blue-900'
    case 'completed':
      return 'bg-green-100 border-green-300 text-green-900'
    case 'pending_payment':
      return 'bg-amber-100 border-amber-300 text-amber-900'
    case 'cancelled':
    case 'cancelled_expired':
      return 'bg-red-100 border-red-300 text-red-900'
    case 'no_show':
      return 'bg-gray-100 border-gray-300 text-gray-600'
    default:
      return 'bg-gray-100 border-gray-300 text-gray-900'
  }
}

export default function RoomsCalendarPage() {
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date()
    return today.toISOString().split('T')[0]
  })
  const [rooms, setRooms] = useState<Room[]>([])
  const [bookings, setBookings] = useState<RoomBooking[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null)

  useEffect(() => {
    fetchRoomsAndBookings()
  }, [selectedDate])

  const fetchRoomsAndBookings = async () => {
    setLoading(true)

    const { data: roomsData } = await supabase
      .from('rooms')
      .select('*')
      .eq('active', true)
      .order('priority', { ascending: true })

    const dayStart = `${selectedDate}T00:00:00`
    const dayEnd = `${selectedDate}T23:59:59`

    const { data: bookingsData } = await supabase
      .from('bookings')
      .select(`
        id,
        start_time,
        end_time,
        room_id,
        status,
        people_count,
        total_price,
        customer:customers(full_name),
        service:services(name),
        payment_transactions(status, amount)
      `)
      .gte('start_time', dayStart)
      .lte('start_time', dayEnd)
      .in('status', ['confirmed', 'pending_payment', 'completed'])

    setRooms((roomsData || []) as Room[])
    setBookings((bookingsData || []) as unknown as RoomBooking[])
    setLoading(false)
  }

  const getBookingForSlot = (roomId: string, timeSlot: string): RoomBooking | null => {
    const slotTime = new Date(`${selectedDate}T${timeSlot}:00`)

    for (const booking of bookings) {
      if (booking.room_id !== roomId) continue

      const bookingStart = new Date(booking.start_time)
      const bookingEnd = new Date(booking.end_time)

      if (slotTime >= bookingStart && slotTime < bookingEnd) {
        return booking
      }
    }

    return null
  }

  const isBookingStart = (roomId: string, timeSlot: string): boolean => {
    const slotTime = new Date(`${selectedDate}T${timeSlot}:00`)

    for (const booking of bookings) {
      if (booking.room_id !== roomId) continue

      const bookingStart = new Date(booking.start_time)
      if (bookingStart.getTime() === slotTime.getTime()) {
        return true
      }
    }

    return false
  }

  const getBookingSpan = (booking: RoomBooking): number => {
    const start = new Date(booking.start_time)
    const end = new Date(booking.end_time)
    const durationMinutes = (end.getTime() - start.getTime()) / 60000
    return Math.ceil(durationMinutes / 30)
  }

  const changeDate = (days: number) => {
    const date = new Date(selectedDate)
    date.setDate(date.getDate() + days)
    setSelectedDate(date.toISOString().split('T')[0])
  }

  const unassignedBookings = bookings.filter(b => !b.room_id)

  const getBookingsForRoom = (roomId: string): RoomBooking[] => {
    return bookings
      .filter(b => b.room_id === roomId)
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
  }

  return (
    <AdminLayout>
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Room Calendar</h1>
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => changeDate(-1)}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-2 sm:px-4 py-2 border border-gray-300 rounded-lg text-gray-900 text-sm sm:text-base w-[140px] sm:w-auto"
            />
            <button
              onClick={() => changeDate(1)}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <button
              onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
              className="px-3 sm:px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200"
            >
              Today
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-600">Loading...</div>
        ) : (
          <>
            {unassignedBookings.length > 0 && (
              <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <h3 className="text-sm font-semibold text-amber-800 mb-2">
                  Unassigned Bookings ({unassignedBookings.length})
                </h3>
                <div className="flex flex-wrap gap-2">
                  {unassignedBookings.map((booking) => (
                    <button
                      key={booking.id}
                      onClick={() => setSelectedBookingId(booking.id)}
                      className="px-2 sm:px-3 py-1.5 sm:py-2 bg-white border border-amber-300 rounded-lg text-xs sm:text-sm hover:bg-amber-100"
                    >
                      <span className="font-medium text-gray-900">{booking.customer?.full_name}</span>
                      <span className="text-gray-500 ml-1 sm:ml-2">
                        {new Date(booking.start_time).toLocaleTimeString('en-ZA', {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="hidden lg:block overflow-x-auto">
              <div className="grid gap-px bg-gray-200 border border-gray-200 rounded-lg overflow-hidden"
                style={{ gridTemplateColumns: `60px repeat(${rooms.length}, minmax(100px, 1fr))` }}
              >
                <div className="bg-gray-50 p-2 sm:p-3 font-semibold text-gray-700 text-xs sm:text-sm">
                  Time
                </div>
                {rooms.map((room) => (
                  <div key={room.id} className="bg-gray-50 p-2 sm:p-3 font-semibold text-gray-900 text-xs sm:text-sm text-center">
                    <span className="truncate block">{room.room_name}</span>
                    <span className="block text-xs text-gray-500 font-normal">Cap: {room.capacity}</span>
                  </div>
                ))}

                {TIME_SLOTS.map((timeSlot) => (
                  <>
                    <div key={`time-${timeSlot}`} className="bg-white p-1 sm:p-2 text-xs sm:text-sm text-gray-600 border-t border-gray-100">
                      {timeSlot}
                    </div>
                    {rooms.map((room) => {
                      const booking = getBookingForSlot(room.id, timeSlot)
                      const isStart = booking && isBookingStart(room.id, timeSlot)

                      if (booking && !isStart) {
                        return <div key={`${room.id}-${timeSlot}`} className="bg-white border-t border-gray-100" />
                      }

                      if (booking && isStart) {
                        const span = getBookingSpan(booking)
                        const paymentStatus = getPaymentStatus(booking)

                        return (
                          <div
                            key={`${room.id}-${timeSlot}`}
                            className="bg-white border-t border-gray-100 relative"
                            style={{ gridRow: `span ${span}` }}
                          >
                            <button
                              onClick={() => setSelectedBookingId(booking.id)}
                              className={`absolute inset-1 rounded-lg border p-2 text-left overflow-hidden hover:shadow-md transition-shadow ${getStatusColor(booking.status)}`}
                            >
                              <p className="font-medium text-sm truncate">
                                {booking.customer?.full_name}
                              </p>
                              <p className="text-xs truncate opacity-80">
                                {booking.service?.name}
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs">
                                  {new Date(booking.start_time).toLocaleTimeString('en-ZA', {
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </span>
                                <span className="text-xs opacity-70">
                                  {booking.people_count}p
                                </span>
                                <span className={`text-xs px-1.5 py-0.5 rounded ${
                                  paymentStatus === 'paid' ? 'bg-green-200 text-green-800' :
                                  paymentStatus === 'partial' ? 'bg-blue-200 text-blue-800' :
                                  'bg-amber-200 text-amber-800'
                                }`}>
                                  {paymentStatus === 'paid' ? 'Paid' :
                                   paymentStatus === 'partial' ? 'Partial' : 'Pending'}
                                </span>
                              </div>
                            </button>
                          </div>
                        )
                      }

                      return (
                        <div key={`${room.id}-${timeSlot}`} className="bg-white border-t border-gray-100 min-h-[40px]" />
                      )
                    })}
                  </>
                ))}
              </div>
            </div>

            <div className="lg:hidden space-y-4">
              {rooms.map((room) => {
                const roomBookings = getBookingsForRoom(room.id)
                return (
                  <div key={room.id} className="bg-white rounded-xl shadow-sm overflow-hidden">
                    <div className="bg-gray-900 text-white px-4 py-3 flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold">{room.room_name}</h3>
                        <p className="text-xs text-gray-300">Capacity: {room.capacity}</p>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        roomBookings.length > 0 ? 'bg-blue-500 text-white' : 'bg-gray-700 text-gray-300'
                      }`}>
                        {roomBookings.length} booking{roomBookings.length !== 1 ? 's' : ''}
                      </span>
                    </div>

                    {roomBookings.length === 0 ? (
                      <div className="p-4 text-center text-gray-500 text-sm">
                        No bookings for this room today
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-100">
                        {roomBookings.map((booking) => {
                          const paymentStatus = getPaymentStatus(booking)
                          return (
                            <button
                              key={booking.id}
                              onClick={() => setSelectedBookingId(booking.id)}
                              className={`w-full p-4 text-left hover:bg-gray-50 transition-colors ${getStatusColor(booking.status)} border-l-4`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <p className="font-medium text-gray-900 truncate">
                                    {booking.customer?.full_name}
                                  </p>
                                  <p className="text-sm text-gray-600 truncate">
                                    {booking.service?.name}
                                  </p>
                                </div>
                                <span className={`text-xs px-2 py-1 rounded shrink-0 ${
                                  paymentStatus === 'paid' ? 'bg-green-200 text-green-800' :
                                  paymentStatus === 'partial' ? 'bg-blue-200 text-blue-800' :
                                  'bg-amber-200 text-amber-800'
                                }`}>
                                  {paymentStatus === 'paid' ? 'Paid' :
                                   paymentStatus === 'partial' ? 'Partial' : 'Pending'}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 mt-2 text-sm text-gray-600">
                                <span className="font-medium">
                                  {new Date(booking.start_time).toLocaleTimeString('en-ZA', {
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                  {' - '}
                                  {new Date(booking.end_time).toLocaleTimeString('en-ZA', {
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </span>
                                <span className="text-gray-400">|</span>
                                <span>{booking.people_count} person{booking.people_count !== 1 ? 's' : ''}</span>
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      <BookingDetailDrawer
        bookingId={selectedBookingId}
        onClose={() => setSelectedBookingId(null)}
        onUpdate={fetchRoomsAndBookings}
      />
    </AdminLayout>
  )
}
