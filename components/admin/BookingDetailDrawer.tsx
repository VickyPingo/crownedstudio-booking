'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import type { BookingStatus, Room } from '@/types/admin'
import { getMinimumBookingDate, isSameDayBooking } from '@/lib/timeSlots'

interface BookingDetailDrawerProps {
  bookingId: string | null
  onClose: () => void
  onUpdate: () => void
}

interface BookingData {
  id: string
  customer_id: string | null
  service_slug: string | null
  voucher_id: string | null
  room_id: string | null
  people_count: number
  status: string
  start_time: string
  end_time: string
  total_price: number
  deposit_due: number
  balance_paid: number
  voucher_code: string | null
  voucher_discount: number
  allergies: string | null
  massage_pressure: string | null
  medical_history: string | null
  customer_date_of_birth: string | null
  pressure_preferences: Record<string, string> | null
  is_pregnant: boolean
  pricing_option_name: string | null
  terms_accepted: boolean | null
  terms_accepted_at: string | null
  customer?: { id: string; full_name: string; email: string | null; phone: string | null; date_of_birth: string | null } | null
  service?: { name: string; category: string | null; duration_minutes: number; service_area: string | null } | null
  voucher?: { code: string; discount_type: string; discount_value: number } | null
  room?: { id: string; room_name: string; room_area: string; capacity: number } | null
  assigned_rooms?: Array<{ id: string; room_name: string; room_area: string; capacity: number; priority: number }>
  booking_upsells: Array<{
    upsell_id: string
    quantity: number
    price_total: number
    person_number: number | null
    duration_added_minutes: number
    upsell_name?: string
    upsell_slug?: string
  }>
  booking_notes: Array<{
    id: string
    note: string
    created_at: string
    created_by: string | null
    note_type?: string
    metadata?: {
      old_start_time?: string
      old_end_time?: string
      new_start_time?: string
      new_end_time?: string
    }
  }>
  payment_transactions: Array<{ id: string; status: string; amount: number; created_at: string }>
}

const STATUS_OPTIONS: { value: BookingStatus; label: string; color: string }[] = [
  { value: 'pending_payment', label: 'Pending Payment', color: 'bg-amber-100 text-amber-800' },
  { value: 'confirmed', label: 'Confirmed', color: 'bg-blue-100 text-blue-800' },
  { value: 'completed', label: 'Completed', color: 'bg-green-100 text-green-800' },
  { value: 'cancelled', label: 'Cancelled', color: 'bg-red-100 text-red-800' },
  { value: 'no_show', label: 'No-show', color: 'bg-gray-100 text-gray-800' },
]

const NON_EDITABLE_STATUSES: BookingStatus[] = ['expired', 'cancelled_expired']

export function BookingDetailDrawer({ bookingId, onClose, onUpdate }: BookingDetailDrawerProps) {
  const [booking, setBooking] = useState<BookingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newNote, setNewNote] = useState('')
  const [addingNote, setAddingNote] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [showReschedule, setShowReschedule] = useState(false)
  const [rescheduleDate, setRescheduleDate] = useState('')
  const [rescheduleTime, setRescheduleTime] = useState('')
  const [markingBalancePaid, setMarkingBalancePaid] = useState(false)
  const [rooms, setRooms] = useState<Room[]>([])
  const [showRoomSelect, setShowRoomSelect] = useState(false)
  const [updatingRoom, setUpdatingRoom] = useState(false)

  useEffect(() => {
    if (bookingId) {
      fetchBooking()
      fetchRooms()
    }
  }, [bookingId])

  const fetchBooking = async () => {
    if (!bookingId) return

    setLoading(true)
    setError(null)

    try {
      const { data: bookingData, error: bookingError } = await supabase
        .from('bookings')
        .select('*')
        .eq('id', bookingId)
        .maybeSingle()

      if (bookingError) {
        console.error('Booking query failed:', bookingError)
        setError(`Failed to load booking: ${bookingError.message}`)
        setLoading(false)
        return
      }

      if (!bookingData) {
        setError('Booking not found')
        setLoading(false)
        return
      }

      const [customerRes, serviceRes, voucherRes, roomRes, bookingRoomsRes, upsellsRes, notesRes, paymentsRes] = await Promise.all([
        bookingData.customer_id
          ? supabase.from('customers').select('id, full_name, email, phone').eq('id', bookingData.customer_id).maybeSingle()
          : { data: null, error: null },
        bookingData.service_slug
          ? supabase.from('services').select('name, category, duration_minutes, service_area').eq('slug', bookingData.service_slug).maybeSingle()
          : { data: null, error: null },
        bookingData.voucher_id
          ? supabase.from('vouchers').select('code, discount_type, discount_value').eq('id', bookingData.voucher_id).maybeSingle()
          : { data: null, error: null },
        bookingData.room_id
          ? supabase.from('rooms').select('id, room_name, room_area, capacity').eq('id', bookingData.room_id).maybeSingle()
          : { data: null, error: null },
        supabase.from('booking_rooms').select('room_id').eq('booking_id', bookingId),
        supabase.from('booking_upsells').select('upsell_id, quantity, price_total, person_number, duration_added_minutes').eq('booking_id', bookingId),
        supabase.from('booking_notes').select('id, note, created_at, created_by, note_type, metadata').eq('booking_id', bookingId).order('created_at', { ascending: false }),
        supabase.from('payment_transactions').select('id, status, amount, created_at').eq('booking_id', bookingId).order('created_at', { ascending: false }),
      ])

      let upsellsWithNames = upsellsRes.data || []
      if (upsellsRes.data && upsellsRes.data.length > 0) {
        const upsellIds = [...new Set(upsellsRes.data.map(u => u.upsell_id))]
        const { data: upsellData } = await supabase.from('upsells').select('id, name, slug').in('id', upsellIds)
        const upsellMap = new Map((upsellData || []).map(u => [u.id, u]))
        upsellsWithNames = upsellsRes.data.map(u => ({
          ...u,
          upsell_name: upsellMap.get(u.upsell_id)?.name,
          upsell_slug: upsellMap.get(u.upsell_id)?.slug,
        }))
      }

      let assignedRooms: Array<{ id: string; room_name: string; room_area: string; capacity: number; priority: number }> = []
      if (bookingRoomsRes.data && bookingRoomsRes.data.length > 0) {
        const roomIds = bookingRoomsRes.data.map(br => br.room_id)
        const { data: roomsData } = await supabase
          .from('rooms')
          .select('id, room_name, room_area, capacity, priority')
          .in('id', roomIds)
          .order('priority', { ascending: true })
        assignedRooms = (roomsData || []) as Array<{ id: string; room_name: string; room_area: string; capacity: number; priority: number }>
      } else if (bookingData.room_id) {
        assignedRooms = roomRes.data ? [{ ...roomRes.data, priority: 0 }] : []
      }

      const enrichedBooking: BookingData = {
        ...bookingData,
        customer: customerRes.data || undefined,
        service: serviceRes.data || undefined,
        voucher: voucherRes.data || undefined,
        room: roomRes.data || undefined,
        assigned_rooms: assignedRooms,
        booking_upsells: upsellsWithNames,
        booking_notes: notesRes.data || [],
        payment_transactions: paymentsRes.data || [],
      }

      setBooking(enrichedBooking)
    } catch (err) {
      console.error('Unexpected error fetching booking:', err)
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  const fetchRooms = async () => {
    const { data } = await supabase
      .from('rooms')
      .select('*')
      .eq('active', true)
      .order('priority', { ascending: true })

    if (data) {
      setRooms(data as Room[])
    }
  }

  const handleRoomChange = async (roomId: string | null) => {
    if (!booking) return

    setUpdatingRoom(true)
    const { error } = await supabase
      .from('bookings')
      .update({ room_id: roomId })
      .eq('id', booking.id)

    if (!error) {
      fetchBooking()
      onUpdate()
      setShowRoomSelect(false)
    }
    setUpdatingRoom(false)
  }

  const handleStatusChange = async (newStatus: BookingStatus) => {
    if (!booking) return

    setUpdatingStatus(true)
    const { error } = await supabase
      .from('bookings')
      .update({ status: newStatus })
      .eq('id', booking.id)

    if (!error) {
      setBooking({ ...booking, status: newStatus })
      onUpdate()
    }
    setUpdatingStatus(false)
  }

  const handleAddNote = async () => {
    if (!booking || !newNote.trim()) return

    setAddingNote(true)
    const { data: { user } } = await supabase.auth.getUser()

    const { error } = await supabase
      .from('booking_notes')
      .insert({
        booking_id: booking.id,
        note: newNote.trim(),
        created_by: user?.id || null,
      })

    if (!error) {
      setNewNote('')
      fetchBooking()
    }
    setAddingNote(false)
  }

  const handleReschedule = async () => {
    if (!booking || !rescheduleDate || !rescheduleTime) return

    if (isSameDayBooking(rescheduleDate)) {
      alert('Same-day bookings are not allowed. Please choose a date from tomorrow onward.')
      return
    }

    const timeInMinutes = parseInt(rescheduleTime.split(':')[0]) * 60 + parseInt(rescheduleTime.split(':')[1])
    const latestStartMinutes = 17 * 60 + 30

    if (timeInMinutes > latestStartMinutes) {
      alert('Booking start time cannot be later than 17:30')
      return
    }

    const oldStartTime = booking.start_time
    const oldEndTime = booking.end_time

    const newStartTime = `${rescheduleDate}T${rescheduleTime}:00`
    const startDate = new Date(newStartTime)

    const baseDuration = booking.service?.duration_minutes || 60
    const upsellDuration = booking.booking_upsells.reduce((total, bu) => total + (bu.duration_added_minutes || 0), 0)
    const totalDuration = baseDuration + upsellDuration
    const endDate = new Date(startDate.getTime() + totalDuration * 60000)

    const { error } = await supabase
      .from('bookings')
      .update({
        start_time: startDate.toISOString(),
        end_time: endDate.toISOString(),
      })
      .eq('id', booking.id)

    if (!error) {
      const { data: { user } } = await supabase.auth.getUser()

      const oldDate = new Date(oldStartTime)
      const newDate = new Date(startDate)

      const rescheduleNote = `Booking rescheduled on ${new Date().toLocaleString('en-ZA', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Africa/Johannesburg',
      })}. Previous: ${oldDate.toLocaleDateString('en-ZA', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'Africa/Johannesburg',
      })} at ${oldDate.toLocaleTimeString('en-ZA', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Africa/Johannesburg',
      })}. New: ${newDate.toLocaleDateString('en-ZA', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'Africa/Johannesburg',
      })} at ${newDate.toLocaleTimeString('en-ZA', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Africa/Johannesburg',
      })}.`

      await supabase.from('booking_notes').insert({
        booking_id: booking.id,
        note: rescheduleNote,
        note_type: 'reschedule',
        metadata: {
          old_start_time: oldStartTime,
          old_end_time: oldEndTime,
          new_start_time: startDate.toISOString(),
          new_end_time: endDate.toISOString(),
        },
        created_by: user?.id || null,
      })

      if (booking.customer?.email) {
        try {
          await fetch('/api/bookings/send-reschedule-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              bookingId: booking.id,
              oldStartTime,
              newStartTime: startDate.toISOString(),
            }),
          })
        } catch (emailError) {
          console.error('Failed to send reschedule email:', emailError)
        }
      }

      setShowReschedule(false)
      setRescheduleDate('')
      setRescheduleTime('')
      fetchBooking()
      onUpdate()
    }
  }

  const handleMarkBalancePaid = async () => {
    if (!booking) return

    const payment = getPaymentSummary()
    if (payment.balanceDue <= 0) return

    setMarkingBalancePaid(true)
    const { data: { user } } = await supabase.auth.getUser()

    const { error } = await supabase
      .from('bookings')
      .update({
        balance_paid: (booking.balance_paid || 0) + payment.balanceDue,
        balance_paid_at: new Date().toISOString(),
        balance_paid_by: user?.id || null,
      })
      .eq('id', booking.id)

    if (!error) {
      fetchBooking()
      onUpdate()
    }
    setMarkingBalancePaid(false)
  }

  const getPaymentSummary = () => {
    if (!booking) return { depositPaid: 0, balanceDue: 0, status: 'pending' }

    const completedPayments = booking.payment_transactions?.filter(p => p.status === 'complete') || []
    const depositPaid = completedPayments.reduce((sum, p) => sum + (p.amount || 0), 0)
    const balancePaid = booking.balance_paid || 0
    const totalPaid = depositPaid + balancePaid
    const balanceDue = Math.max(0, booking.total_price - totalPaid)

    let status = 'pending'
    if (balanceDue <= 0) {
      status = 'fully_paid'
    } else if (depositPaid > 0) {
      status = 'deposit_paid'
    }

    return { depositPaid, balanceDue, totalPaid, status }
  }

  if (!bookingId) return null

  const payment = getPaymentSummary()

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-xl bg-white shadow-xl overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-semibold text-gray-900">Booking Details</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="p-6 text-center text-gray-600">Loading...</div>
        ) : error ? (
          <div className="p-6 text-center">
            <p className="text-red-600 font-medium">{error}</p>
            <button
              onClick={fetchBooking}
              className="mt-4 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800"
            >
              Retry
            </button>
          </div>
        ) : !booking ? (
          <div className="p-6 text-center text-gray-600">Booking not found</div>
        ) : (
          <div className="p-6 space-y-6">
            <section>
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">Client</h3>
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <p className="font-medium text-gray-900">{booking.customer?.full_name}</p>
                <p className="text-sm text-gray-600">{booking.customer?.email}</p>
                <p className="text-sm text-gray-600">{booking.customer?.phone}</p>
              </div>
            </section>

            <section>
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">Service</h3>
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <p className="font-medium text-gray-900">{booking.service?.name}</p>
                {booking.pricing_option_name && (
                  <p className="text-sm text-blue-700 font-medium">{booking.pricing_option_name}</p>
                )}
                <p className="text-sm text-gray-600">{booking.service?.category}</p>
                <p className="text-sm text-gray-600">
                  {booking.people_count} person(s) - {Math.round((new Date(booking.end_time).getTime() - new Date(booking.start_time).getTime()) / 60000)} min
                  {Math.round((new Date(booking.end_time).getTime() - new Date(booking.start_time).getTime()) / 60000) > (booking.service?.duration_minutes || 0) && (
                    <span className="text-gray-500"> (includes add-ons)</span>
                  )}
                </p>
              </div>
            </section>

            <section>
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">Date & Time</h3>
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <p className="font-medium text-gray-900">
                  {new Date(booking.start_time).toLocaleDateString('en-ZA', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
                <p className="text-sm text-gray-600">
                  {new Date(booking.start_time).toLocaleTimeString('en-ZA', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  {' - '}
                  {new Date(booking.end_time).toLocaleTimeString('en-ZA', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
            </section>

            <section>
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">Room Assignment</h3>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-xs text-gray-500">Required area:</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    booking.service?.service_area === 'public'
                      ? 'bg-teal-100 text-teal-800'
                      : 'bg-blue-100 text-blue-800'
                  }`}>
                    {booking.service?.service_area || 'treatment'}
                  </span>
                </div>
                {!showRoomSelect ? (
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      {booking.assigned_rooms && booking.assigned_rooms.length > 0 ? (
                        <div className="space-y-2">
                          {booking.assigned_rooms.length > 1 && (
                            <p className="text-xs text-blue-600 font-medium mb-2">
                              Multi-room booking ({booking.assigned_rooms.length} rooms)
                            </p>
                          )}
                          {booking.assigned_rooms.map((room, index) => (
                            <div key={room.id} className={index > 0 ? 'pt-2 border-t border-gray-200' : ''}>
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-gray-900">{room.room_name}</p>
                                <span className={`text-xs px-2 py-0.5 rounded-full ${
                                  room.room_area === 'public'
                                    ? 'bg-teal-100 text-teal-800'
                                    : 'bg-blue-100 text-blue-800'
                                }`}>
                                  {room.room_area}
                                </span>
                                {booking.assigned_rooms && booking.assigned_rooms.length > 1 && (
                                  <span className="text-xs text-gray-500">
                                    (Priority {room.priority})
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-gray-600">Capacity: {room.capacity}</p>
                            </div>
                          ))}
                          <div className="pt-2 border-t border-gray-200">
                            <p className="text-xs text-gray-600">
                              Total capacity: {booking.assigned_rooms.reduce((sum, r) => sum + r.capacity, 0)} people
                            </p>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500">No room assigned</p>
                      )}
                    </div>
                    <button
                      onClick={() => setShowRoomSelect(true)}
                      className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      {rooms.map((room) => {
                        const isMatchingArea = room.room_area === (booking.service?.service_area || 'treatment')
                        return (
                          <button
                            key={room.id}
                            onClick={() => handleRoomChange(room.id)}
                            disabled={updatingRoom}
                            className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                              booking.room_id === room.id
                                ? 'border-gray-900 bg-gray-900 text-white'
                                : isMatchingArea
                                  ? 'border-gray-200 bg-white hover:border-gray-400 text-gray-900'
                                  : 'border-gray-200 bg-gray-100 text-gray-500'
                            } disabled:opacity-50`}
                          >
                            <div className="flex justify-between items-center">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{room.room_name}</span>
                                <span className={`text-xs px-1.5 py-0.5 rounded ${
                                  booking.room_id === room.id
                                    ? 'bg-gray-700 text-gray-300'
                                    : room.room_area === 'public'
                                      ? 'bg-teal-100 text-teal-800'
                                      : 'bg-blue-100 text-blue-800'
                                }`}>
                                  {room.room_area}
                                </span>
                              </div>
                              <span className={`text-sm ${booking.room_id === room.id ? 'text-gray-300' : 'text-gray-500'}`}>
                                Cap: {room.capacity}
                              </span>
                            </div>
                          </button>
                        )
                      })}
                      <button
                        onClick={() => handleRoomChange(null)}
                        disabled={updatingRoom}
                        className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                          !booking.room_id
                            ? 'border-gray-900 bg-gray-900 text-white'
                            : 'border-gray-200 bg-white hover:border-gray-400 text-gray-500'
                        } disabled:opacity-50`}
                      >
                        Unassign Room
                      </button>
                    </div>
                    <button
                      onClick={() => setShowRoomSelect(false)}
                      className="w-full px-3 py-2 text-sm text-gray-600 hover:text-gray-900"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </section>

            <section>
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">Add-ons</h3>
              {booking.booking_upsells && booking.booking_upsells.length > 0 ? (
                <div className="bg-gray-50 rounded-lg p-4 space-y-4">
                  {(() => {
                    const grouped = booking.booking_upsells.reduce((acc, upsell) => {
                      const person = upsell.person_number || 1
                      if (!acc[person]) acc[person] = []
                      acc[person].push(upsell)
                      return acc
                    }, {} as Record<number, typeof booking.booking_upsells>)

                    const sortedPersons = Object.keys(grouped).map(Number).sort((a, b) => a - b)
                    const upsellsTotal = booking.booking_upsells.reduce((sum, u) => sum + (u.price_total || 0), 0)

                    return (
                      <>
                        {sortedPersons.map((personNum) => (
                          <div key={personNum}>
                            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">
                              Person {personNum}
                            </p>
                            <div className="space-y-1.5">
                              {grouped[personNum].map((upsell, idx) => (
                                <div key={idx} className="flex justify-between text-sm">
                                  <span className="text-gray-700">{upsell.upsell_name || 'Unknown add-on'}</span>
                                  <span className="text-gray-900 font-medium">R{upsell.price_total}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                        <div className="border-t pt-3 flex justify-between">
                          <span className="text-sm font-medium text-gray-700">Add-ons Total</span>
                          <span className="font-semibold text-gray-900">R{upsellsTotal.toLocaleString()}</span>
                        </div>
                      </>
                    )
                  })()}
                </div>
              ) : (
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-500">No add-ons selected</p>
                </div>
              )}
            </section>

            {(booking.voucher_code || booking.voucher_discount > 0) && (
              <section>
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">Voucher</h3>
                <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-700">Code</span>
                    <span className="text-gray-900 font-medium font-mono">{booking.voucher_code || '-'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-700">Discount Applied</span>
                    <span className="text-green-700 font-medium">-R{(booking.voucher_discount || 0).toLocaleString()}</span>
                  </div>
                </div>
              </section>
            )}

            <section>
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">Client Information</h3>
              <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                {(booking.customer_date_of_birth || booking.customer?.date_of_birth) && (
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Date of Birth</p>
                    <p className="text-sm text-gray-900">
                      {new Date(booking.customer_date_of_birth || booking.customer?.date_of_birth || '').toLocaleDateString('en-ZA', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-gray-500 uppercase">Allergies</p>
                  <p className="text-sm text-gray-900">{booking.allergies || 'None specified'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase">Medical History</p>
                  <p className="text-sm text-gray-900">{booking.medical_history || 'None specified'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase">Pregnancy Status</p>
                  <div className="flex items-center gap-2">
                    {booking.is_pregnant ? (
                      <>
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-pink-100 text-pink-800">
                          Pregnant
                        </span>
                        <span className="text-xs text-gray-600 italic">Pregnancy-safe massage required</span>
                      </>
                    ) : (
                      <span className="text-sm text-gray-900">Not pregnant</span>
                    )}
                  </div>
                </div>
              </div>
            </section>

            <section>
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">Massage Preferences</h3>
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                {booking.pressure_preferences && Object.keys(booking.pressure_preferences).length > 0 ? (
                  Object.entries(booking.pressure_preferences).map(([person, pressure]) => (
                    <div key={person} className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Person {person}:</span>
                      <span className="text-sm font-medium text-gray-900 capitalize">{pressure}</span>
                    </div>
                  ))
                ) : booking.massage_pressure ? (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Pressure:</span>
                    <span className="text-sm font-medium text-gray-900 capitalize">{booking.massage_pressure}</span>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 italic">No pressure preferences specified</p>
                )}
              </div>
            </section>

            <section>
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">Terms & Conditions</h3>
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <div>
                  <p className="text-xs text-gray-500 uppercase">Terms Accepted</p>
                  <div className="flex items-center gap-2 mt-1">
                    {booking.terms_accepted ? (
                      <>
                        <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="text-sm font-medium text-green-700">Yes</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="text-sm text-gray-500">No</span>
                      </>
                    )}
                  </div>
                </div>
                {booking.terms_accepted_at && (
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Accepted At</p>
                    <p className="text-sm text-gray-900">
                      {new Date(booking.terms_accepted_at).toLocaleString('en-ZA', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                )}
              </div>
            </section>

            <section>
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">Payment</h3>
              <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Total Amount</span>
                  <span className="font-medium text-gray-900">R{booking.total_price?.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Deposit Paid</span>
                  <span className="font-medium text-green-700">R{payment.depositPaid?.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Balance Paid</span>
                  <span className="font-medium text-green-700">R{(booking.balance_paid || 0).toLocaleString()}</span>
                </div>
                <div className="border-t pt-2 flex justify-between">
                  <span className="text-sm font-medium text-gray-700">Balance Due</span>
                  <span className={`font-semibold ${payment.balanceDue > 0 ? 'text-amber-700' : 'text-green-700'}`}>
                    R{payment.balanceDue?.toLocaleString()}
                  </span>
                </div>
                <div className="pt-2">
                  <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                    payment.status === 'fully_paid' ? 'bg-green-100 text-green-800' :
                    payment.status === 'deposit_paid' ? 'bg-blue-100 text-blue-800' :
                    'bg-amber-100 text-amber-800'
                  }`}>
                    {payment.status === 'fully_paid' ? 'Fully Paid' :
                     payment.status === 'deposit_paid' ? 'Deposit Paid' : 'Pending'}
                  </span>
                </div>
              </div>
            </section>

            <section>
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">Status</h3>
              {NON_EDITABLE_STATUSES.includes(booking.status as BookingStatus) ? (
                <div className="bg-gray-50 rounded-lg p-4">
                  <span className={`inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-medium ${
                    booking.status === 'expired' || booking.status === 'cancelled_expired'
                      ? 'bg-orange-100 text-orange-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {booking.status === 'expired' ? 'Expired' : 'Expired (Legacy)'}
                  </span>
                  <p className="text-xs text-gray-500 mt-2">Payment window lapsed. This booking is kept for audit purposes and does not block any rooms.</p>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {STATUS_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => handleStatusChange(opt.value)}
                      disabled={updatingStatus || booking.status === opt.value}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                        booking.status === opt.value
                          ? `${opt.color} ring-2 ring-offset-1 ring-gray-400`
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      } disabled:opacity-50`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">Internal Notes</h3>
              <div className="space-y-3">
                {booking.booking_notes && booking.booking_notes.length > 0 ? (
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {booking.booking_notes.map((note) => (
                      <div
                        key={note.id}
                        className={`rounded-lg p-3 ${
                          note.note_type === 'reschedule'
                            ? 'bg-amber-50 border border-amber-200'
                            : 'bg-gray-50'
                        }`}
                      >
                        {note.note_type === 'reschedule' && (
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <span className="text-xs font-semibold text-amber-800 uppercase">Rescheduled</span>
                          </div>
                        )}
                        <p className={`text-sm ${note.note_type === 'reschedule' ? 'text-amber-900' : 'text-gray-900'}`}>
                          {note.note}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {new Date(note.created_at).toLocaleString('en-ZA', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            timeZone: 'Africa/Johannesburg',
                          })}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No notes yet</p>
                )}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="Add a note..."
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-500"
                  />
                  <button
                    onClick={handleAddNote}
                    disabled={addingNote || !newNote.trim()}
                    className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>
              </div>
            </section>

            <section className="border-t pt-6">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">Actions</h3>
              <div className="space-y-3">
                {!showReschedule ? (
                  <button
                    onClick={() => setShowReschedule(true)}
                    className="w-full px-4 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                  >
                    Reschedule Booking
                  </button>
                ) : (
                  <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">New Date (tomorrow or later)</label>
                        <input
                          type="date"
                          value={rescheduleDate}
                          onChange={(e) => setRescheduleDate(e.target.value)}
                          min={getMinimumBookingDate()}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">New Time (max 17:30)</label>
                        <input
                          type="time"
                          value={rescheduleTime}
                          onChange={(e) => setRescheduleTime(e.target.value)}
                          max="17:30"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowReschedule(false)}
                        className="flex-1 px-3 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleReschedule}
                        disabled={!rescheduleDate || !rescheduleTime}
                        className="flex-1 px-3 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                      >
                        Confirm
                      </button>
                    </div>
                  </div>
                )}

                {payment.balanceDue > 0 && (
                  <button
                    onClick={handleMarkBalancePaid}
                    disabled={markingBalancePaid}
                    className="w-full px-4 py-2.5 bg-white border border-green-300 text-green-700 rounded-lg text-sm font-medium hover:bg-green-50 transition-colors disabled:opacity-50"
                  >
                    {markingBalancePaid ? 'Processing...' : `Mark Balance Paid (R${payment.balanceDue.toLocaleString()})`}
                  </button>
                )}

                <button
                  onClick={() => handleStatusChange('no_show')}
                  disabled={booking.status === 'no_show'}
                  className="w-full px-4 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Mark as No-show
                </button>

                <button
                  onClick={() => handleStatusChange('cancelled')}
                  disabled={booking.status === 'cancelled'}
                  className="w-full px-4 py-2.5 bg-white border border-red-300 text-red-700 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  Cancel Booking
                </button>

                <button
                  onClick={() => handleStatusChange('completed')}
                  disabled={booking.status === 'completed'}
                  className="w-full px-4 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
                >
                  Mark as Completed
                </button>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
