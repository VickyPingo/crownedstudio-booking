'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import type { BookingDetail, BookingStatus } from '@/types/admin'

interface BookingDetailDrawerProps {
  bookingId: string | null
  onClose: () => void
  onUpdate: () => void
}

const STATUS_OPTIONS: { value: BookingStatus; label: string; color: string }[] = [
  { value: 'pending_payment', label: 'Pending Payment', color: 'bg-amber-100 text-amber-800' },
  { value: 'confirmed', label: 'Confirmed', color: 'bg-blue-100 text-blue-800' },
  { value: 'completed', label: 'Completed', color: 'bg-green-100 text-green-800' },
  { value: 'cancelled', label: 'Cancelled', color: 'bg-red-100 text-red-800' },
  { value: 'no_show', label: 'No-show', color: 'bg-gray-100 text-gray-800' },
]

export function BookingDetailDrawer({ bookingId, onClose, onUpdate }: BookingDetailDrawerProps) {
  const [booking, setBooking] = useState<BookingDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [newNote, setNewNote] = useState('')
  const [addingNote, setAddingNote] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [showReschedule, setShowReschedule] = useState(false)
  const [rescheduleDate, setRescheduleDate] = useState('')
  const [rescheduleTime, setRescheduleTime] = useState('')

  useEffect(() => {
    if (bookingId) {
      fetchBooking()
    }
  }, [bookingId])

  const fetchBooking = async () => {
    if (!bookingId) return

    setLoading(true)
    const { data, error } = await supabase
      .from('bookings')
      .select(`
        *,
        customer:customers(id, full_name, email, phone),
        service:services(name, category, duration_minutes),
        booking_upsells(
          upsell_id,
          quantity,
          price_total,
          person_number,
          upsell:upsells(name, slug)
        ),
        booking_notes(id, note, created_at, created_by),
        payment_transactions(id, status, amount, created_at)
      `)
      .eq('id', bookingId)
      .maybeSingle()

    if (!error && data) {
      setBooking(data as unknown as BookingDetail)
    }
    setLoading(false)
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

    const newStartTime = `${rescheduleDate}T${rescheduleTime}:00`
    const startDate = new Date(newStartTime)
    const duration = booking.service?.duration_minutes || 60
    const endDate = new Date(startDate.getTime() + duration * 60000)

    const { error } = await supabase
      .from('bookings')
      .update({
        start_time: startDate.toISOString(),
        end_time: endDate.toISOString(),
      })
      .eq('id', booking.id)

    if (!error) {
      setShowReschedule(false)
      setRescheduleDate('')
      setRescheduleTime('')
      fetchBooking()
      onUpdate()
    }
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
                <p className="text-sm text-gray-600">{booking.service?.category}</p>
                <p className="text-sm text-gray-600">{booking.people_count} person(s) - {booking.service?.duration_minutes} min</p>
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

            {booking.booking_upsells && booking.booking_upsells.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">Upsells</h3>
                <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                  {booking.booking_upsells.map((upsell, idx) => (
                    <div key={idx} className="flex justify-between text-sm">
                      <span className="text-gray-700">
                        {upsell.upsell?.name} (Person {upsell.person_number})
                      </span>
                      <span className="text-gray-900 font-medium">R{upsell.price_total}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section>
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">Health Information</h3>
              <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                <div>
                  <p className="text-xs text-gray-500 uppercase">Allergies</p>
                  <p className="text-sm text-gray-900">{booking.allergies || 'None specified'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase">Massage Pressure</p>
                  <p className="text-sm text-gray-900 capitalize">{booking.massage_pressure}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase">Medical History</p>
                  <p className="text-sm text-gray-900">{booking.medical_history || 'None specified'}</p>
                </div>
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
            </section>

            <section>
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">Internal Notes</h3>
              <div className="space-y-3">
                {booking.booking_notes && booking.booking_notes.length > 0 ? (
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {booking.booking_notes.map((note) => (
                      <div key={note.id} className="bg-gray-50 rounded-lg p-3">
                        <p className="text-sm text-gray-900">{note.note}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {new Date(note.created_at).toLocaleString('en-ZA')}
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
                        <label className="block text-xs text-gray-600 mb-1">New Date</label>
                        <input
                          type="date"
                          value={rescheduleDate}
                          onChange={(e) => setRescheduleDate(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">New Time</label>
                        <input
                          type="time"
                          value={rescheduleTime}
                          onChange={(e) => setRescheduleTime(e.target.value)}
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
