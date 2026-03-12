'use client'

import { AdminLayout } from '@/components/admin/AdminLayout'
import { BookingDetailDrawer } from '@/components/admin/BookingDetailDrawer'
import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import type { CustomerProfile } from '@/types/admin'

interface CustomerBooking {
  id: string
  status: string
  start_time: string
  total_price: number
  people_count: number
  allergies: string | null
  massage_pressure: string
  service: {
    name: string
  } | null
  booking_upsells: {
    upsell_id: string
    price_total: number
    upsell: {
      name: string
    }
  }[]
  payment_transactions: {
    status: string
    amount: number
  }[]
}

interface ClientNote {
  id: string
  note: string
  created_at: string
  booking_id: string | null
}

export default function ClientProfilePage() {
  const params = useParams()
  const router = useRouter()
  const customerId = params.id as string

  const [customer, setCustomer] = useState<CustomerProfile | null>(null)
  const [bookings, setBookings] = useState<CustomerBooking[]>([])
  const [clientNotes, setClientNotes] = useState<ClientNote[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null)
  const [newNote, setNewNote] = useState('')
  const [addingNote, setAddingNote] = useState(false)

  const [editMode, setEditMode] = useState(false)
  const [editData, setEditData] = useState({
    allergies: '',
    massage_pressure: 'medium',
    medical_notes: '',
    private_notes: '',
  })

  const fetchData = useCallback(async () => {
    setLoading(true)

    const [customerRes, bookingsRes, notesRes] = await Promise.all([
      supabase
        .from('customers')
        .select('*')
        .eq('id', customerId)
        .maybeSingle(),
      supabase
        .from('bookings')
        .select(`
          id,
          status,
          start_time,
          total_price,
          people_count,
          allergies,
          massage_pressure,
          service:services(name),
          booking_upsells(
            upsell_id,
            price_total,
            upsell:upsells(name)
          ),
          payment_transactions(status, amount)
        `)
        .eq('customer_id', customerId)
        .order('start_time', { ascending: false }),
      supabase
        .from('client_notes')
        .select('id, note, created_at, booking_id')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false }),
    ])

    if (customerRes.data) {
      setCustomer(customerRes.data)
      setEditData({
        allergies: customerRes.data.allergies || '',
        massage_pressure: customerRes.data.massage_pressure || 'medium',
        medical_notes: customerRes.data.medical_notes || '',
        private_notes: customerRes.data.private_notes || '',
      })
    }

    if (bookingsRes.data) {
      setBookings(bookingsRes.data as unknown as CustomerBooking[])
    }

    if (notesRes.data) {
      setClientNotes(notesRes.data)
    }

    setLoading(false)
  }, [customerId])

  useEffect(() => {
    if (customerId) {
      fetchData()
    }
  }, [customerId, fetchData])

  const handleSaveProfile = async () => {
    if (!customer) return

    setSaving(true)
    const { error } = await supabase
      .from('customers')
      .update({
        allergies: editData.allergies || null,
        massage_pressure: editData.massage_pressure,
        medical_notes: editData.medical_notes || null,
        private_notes: editData.private_notes || null,
      })
      .eq('id', customer.id)

    if (!error) {
      setEditMode(false)
      fetchData()
    }
    setSaving(false)
  }

  const handleAddNote = async () => {
    if (!customer || !newNote.trim()) return

    setAddingNote(true)
    const { data: { user } } = await supabase.auth.getUser()

    const { error } = await supabase
      .from('client_notes')
      .insert({
        customer_id: customer.id,
        note: newNote.trim(),
        created_by: user?.id || null,
      })

    if (!error) {
      setNewNote('')
      fetchData()
    }
    setAddingNote(false)
  }

  const getTotalSpent = () => {
    return bookings.reduce((total, booking) => {
      const paid = booking.payment_transactions
        ?.filter(p => p.status === 'complete')
        .reduce((sum, p) => sum + (p.amount || 0), 0) || 0
      return total + paid
    }, 0)
  }

  const getUpcomingBooking = () => {
    const now = new Date()
    return bookings.find(b =>
      new Date(b.start_time) > now &&
      !['cancelled', 'cancelled_expired', 'no_show'].includes(b.status)
    )
  }

  const getLastVisit = () => {
    const completed = bookings.filter(b => b.status === 'completed')
    if (completed.length === 0) return null
    return completed[0]
  }

  const getAllUpsells = () => {
    const upsellMap = new Map<string, { name: string; count: number; total: number }>()
    bookings.forEach(booking => {
      booking.booking_upsells?.forEach(bu => {
        const existing = upsellMap.get(bu.upsell_id)
        if (existing) {
          existing.count += 1
          existing.total += bu.price_total || 0
        } else {
          upsellMap.set(bu.upsell_id, {
            name: bu.upsell?.name || 'Unknown',
            count: 1,
            total: bu.price_total || 0,
          })
        }
      })
    })
    return Array.from(upsellMap.values())
  }

  const getServicesUsed = () => {
    const serviceMap = new Map<string, { name: string; count: number; total: number }>()
    bookings.forEach(booking => {
      if (!booking.service?.name) return
      const serviceName = booking.service.name
      const paid = booking.payment_transactions
        ?.filter(p => p.status === 'complete')
        .reduce((sum, p) => sum + (p.amount || 0), 0) || 0

      const existing = serviceMap.get(serviceName)
      if (existing) {
        existing.count += 1
        existing.total += paid
      } else {
        serviceMap.set(serviceName, {
          name: serviceName,
          count: 1,
          total: paid,
        })
      }
    })
    return Array.from(serviceMap.values()).sort((a, b) => b.count - a.count)
  }

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

  if (loading) {
    return (
      <AdminLayout>
        <div className="p-8 text-center text-gray-600">Loading client profile...</div>
      </AdminLayout>
    )
  }

  if (!customer) {
    return (
      <AdminLayout>
        <div className="p-8 text-center">
          <p className="text-gray-600 mb-4">Client not found.</p>
          <button
            onClick={() => router.push('/admin/clients')}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg"
          >
            Back to Clients
          </button>
        </div>
      </AdminLayout>
    )
  }

  const totalSpent = getTotalSpent()
  const upcoming = getUpcomingBooking()
  const lastVisit = getLastVisit()
  const allUpsells = getAllUpsells()
  const servicesUsed = getServicesUsed()

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/admin/clients')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{customer.full_name}</h1>
            <p className="text-gray-600">{customer.email}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-xl shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Contact Information</h2>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Email</p>
                  <p className="font-medium text-gray-900">{customer.email || 'Not provided'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Phone</p>
                  <p className="font-medium text-gray-900">{customer.phone || 'Not provided'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Client Since</p>
                  <p className="font-medium text-gray-900">
                    {new Date(customer.created_at).toLocaleDateString('en-ZA', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Total Bookings</p>
                  <p className="font-medium text-gray-900">{bookings.length}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Health & Preferences</h2>
                {!editMode ? (
                  <button
                    onClick={() => setEditMode(true)}
                    className="text-sm text-gray-600 hover:text-gray-900"
                  >
                    Edit
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditMode(false)}
                      className="text-sm text-gray-600 hover:text-gray-900"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveProfile}
                      disabled={saving}
                      className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                    >
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                )}
              </div>

              {editMode ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Allergies</label>
                    <textarea
                      value={editData.allergies}
                      onChange={(e) => setEditData({ ...editData, allergies: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
                      rows={2}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Massage Pressure</label>
                    <select
                      value={editData.massage_pressure}
                      onChange={(e) => setEditData({ ...editData, massage_pressure: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
                    >
                      <option value="soft">Soft</option>
                      <option value="medium">Medium</option>
                      <option value="hard">Hard</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Medical Notes</label>
                    <textarea
                      value={editData.medical_notes}
                      onChange={(e) => setEditData({ ...editData, medical_notes: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
                      rows={3}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Private Notes (Staff Only)</label>
                    <textarea
                      value={editData.private_notes}
                      onChange={(e) => setEditData({ ...editData, private_notes: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
                      rows={3}
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-gray-600">Allergies</p>
                    <p className="font-medium text-gray-900">{customer.allergies || 'None recorded'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Preferred Massage Pressure</p>
                    <p className="font-medium text-gray-900 capitalize">{customer.massage_pressure || 'Medium'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Medical Notes</p>
                    <p className="font-medium text-gray-900">{customer.medical_notes || 'None recorded'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Private Notes</p>
                    <p className="font-medium text-gray-900">{customer.private_notes || 'None recorded'}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Booking History</h2>
              {bookings.length === 0 ? (
                <p className="text-gray-600">No bookings yet.</p>
              ) : (
                <div className="space-y-3">
                  {bookings.map((booking) => (
                    <button
                      key={booking.id}
                      onClick={() => setSelectedBookingId(booking.id)}
                      className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors text-left"
                    >
                      <div>
                        <p className="font-medium text-gray-900">{booking.service?.name}</p>
                        <p className="text-sm text-gray-600">
                          {new Date(booking.start_time).toLocaleDateString('en-ZA')} at{' '}
                          {new Date(booking.start_time).toLocaleTimeString('en-ZA', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-medium text-gray-900">R{booking.total_price?.toLocaleString()}</span>
                        <span className={`px-2 py-1 text-xs rounded-full ${getStatusBadge(booking.status)}`}>
                          {formatStatus(booking.status)}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Summary</h2>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-600">Total Spent</p>
                  <p className="text-2xl font-bold text-gray-900">R{totalSpent.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Last Visit</p>
                  <p className="font-medium text-gray-900">
                    {lastVisit
                      ? new Date(lastVisit.start_time).toLocaleDateString('en-ZA')
                      : 'No completed visits'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Upcoming Appointment</p>
                  {upcoming ? (
                    <div>
                      <p className="font-medium text-gray-900">{upcoming.service?.name}</p>
                      <p className="text-sm text-gray-600">
                        {new Date(upcoming.start_time).toLocaleDateString('en-ZA')} at{' '}
                        {new Date(upcoming.start_time).toLocaleTimeString('en-ZA', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  ) : (
                    <p className="font-medium text-gray-900">None scheduled</p>
                  )}
                </div>
              </div>
            </div>

            {servicesUsed.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Services Used</h2>
                <div className="space-y-3">
                  {servicesUsed.map((service, idx) => (
                    <div key={idx} className="flex justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{service.name}</p>
                        <p className="text-xs text-gray-600">{service.count} booking{service.count !== 1 ? 's' : ''}</p>
                      </div>
                      <p className="text-sm font-medium text-gray-900">R{service.total.toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {allUpsells.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Upsell History</h2>
                <div className="space-y-3">
                  {allUpsells.map((upsell, idx) => (
                    <div key={idx} className="flex justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{upsell.name}</p>
                        <p className="text-xs text-gray-600">{upsell.count} time{upsell.count !== 1 ? 's' : ''}</p>
                      </div>
                      <p className="text-sm font-medium text-gray-900">R{upsell.total.toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Staff Notes</h2>
              <div className="space-y-3">
                {clientNotes.length > 0 ? (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {clientNotes.map((note) => (
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
            </div>
          </div>
        </div>
      </div>

      <BookingDetailDrawer
        bookingId={selectedBookingId}
        onClose={() => setSelectedBookingId(null)}
        onUpdate={fetchData}
      />
    </AdminLayout>
  )
}
