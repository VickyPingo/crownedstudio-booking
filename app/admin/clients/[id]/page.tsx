'use client'

import { AdminLayout } from '@/components/admin/AdminLayout'
import { BookingDetailDrawer } from '@/components/admin/BookingDetailDrawer'
import { ManualBookingModal } from '@/components/admin/ManualBookingModal'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import type { CustomerProfile } from '@/types/admin'

interface CustomerBooking {
  id: string
  status: string
  start_time: string
  end_time: string
  total_price: number
  people_count: number
  allergies: string | null
  massage_pressure: string
  base_price: number
  surcharge_total: number
  upsells_total: number
  voucher_code: string | null
  voucher_discount: number
  service: {
    name: string
    category: string
  } | null
  booking_upsells: {
    upsell_id: string
    price_total: number
    quantity: number
    person_number: number
    upsell: {
      name: string
      slug: string
    }
  }[]
  payment_transactions: {
    id: string
    status: string
    amount: number
    created_at: string
    payment_method: string | null
  }[]
}

interface ClientNote {
  id: string
  note: string
  created_at: string
  booking_id: string | null
  created_by: string | null
}

interface VoucherUsage {
  id: string
  discount_applied: number
  created_at: string
  voucher: {
    code: string
    discount_type: string
    discount_value: number
  }
  booking: {
    id: string
    start_time: string
    service: {
      name: string
    } | null
  }
}

type BookingTab = 'upcoming' | 'completed' | 'all' | 'payments'

export default function ClientProfilePage() {
  const params = useParams()
  const router = useRouter()
  const customerId = params.id as string

  const [customer, setCustomer] = useState<CustomerProfile | null>(null)
  const [bookings, setBookings] = useState<CustomerBooking[]>([])
  const [clientNotes, setClientNotes] = useState<ClientNote[]>([])
  const [voucherUsage, setVoucherUsage] = useState<VoucherUsage[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null)
  const [newNote, setNewNote] = useState('')
  const [addingNote, setAddingNote] = useState(false)
  const [activeTab, setActiveTab] = useState<BookingTab>('all')
  const [showManualBooking, setShowManualBooking] = useState(false)

  const [editMode, setEditMode] = useState(false)
  const [editData, setEditData] = useState({
    date_of_birth: '',
    allergies: '',
    massage_pressure: 'medium',
    medical_notes: '',
    private_notes: '',
  })

  const fetchData = useCallback(async () => {
    setLoading(true)

    const [customerRes, bookingsRes, notesRes, voucherRes] = await Promise.all([
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
          end_time,
          total_price,
          people_count,
          allergies,
          massage_pressure,
          base_price,
          surcharge_total,
          upsells_total,
          voucher_code,
          voucher_discount,
          service:services(name, category),
          booking_upsells(
            upsell_id,
            price_total,
            quantity,
            person_number,
            upsell:upsells(name, slug)
          ),
          payment_transactions(id, status, amount, created_at, payment_method)
        `)
        .eq('customer_id', customerId)
        .order('start_time', { ascending: false }),
      supabase
        .from('client_notes')
        .select('id, note, created_at, booking_id, created_by')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false }),
      supabase
        .from('voucher_usage')
        .select(`
          id,
          discount_applied,
          created_at,
          voucher:vouchers(code, discount_type, discount_value),
          booking:bookings(id, start_time, service:services(name))
        `)
        .eq('booking.customer_id', customerId)
        .order('created_at', { ascending: false }),
    ])

    if (customerRes.data) {
      setCustomer(customerRes.data)
      setEditData({
        date_of_birth: customerRes.data.date_of_birth || '',
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

    if (voucherRes.data) {
      const validUsage = voucherRes.data.filter(v => v.booking !== null) as unknown as VoucherUsage[]
      setVoucherUsage(validUsage)
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

  const handleDeleteNote = async (noteId: string) => {
    const { error } = await supabase
      .from('client_notes')
      .delete()
      .eq('id', noteId)

    if (!error) {
      fetchData()
    }
  }

  const totalSpent = useMemo(() => {
    return bookings.reduce((total, booking) => {
      const paid = booking.payment_transactions
        ?.filter(p => p.status === 'complete')
        .reduce((sum, p) => sum + (p.amount || 0), 0) || 0
      return total + paid
    }, 0)
  }, [bookings])

  const upcomingBookings = useMemo(() => {
    const now = new Date()
    return bookings.filter(b =>
      new Date(b.start_time) > now &&
      !['cancelled', 'cancelled_expired', 'no_show'].includes(b.status)
    )
  }, [bookings])

  const completedBookings = useMemo(() => {
    return bookings.filter(b => b.status === 'completed')
  }, [bookings])

  const lastVisit = useMemo(() => {
    if (completedBookings.length === 0) return null
    return completedBookings[0]
  }, [completedBookings])

  const allPayments = useMemo(() => {
    const payments: { transaction: CustomerBooking['payment_transactions'][0]; booking: CustomerBooking }[] = []
    bookings.forEach(booking => {
      booking.payment_transactions?.forEach(tx => {
        payments.push({ transaction: tx, booking })
      })
    })
    return payments.sort((a, b) =>
      new Date(b.transaction.created_at).getTime() - new Date(a.transaction.created_at).getTime()
    )
  }, [bookings])

  const allUpsells = useMemo(() => {
    const upsellMap = new Map<string, { name: string; count: number; total: number; byPerson: Map<number, number> }>()
    bookings.forEach(booking => {
      booking.booking_upsells?.forEach(bu => {
        const existing = upsellMap.get(bu.upsell_id)
        if (existing) {
          existing.count += bu.quantity
          existing.total += bu.price_total || 0
          const personCount = existing.byPerson.get(bu.person_number) || 0
          existing.byPerson.set(bu.person_number, personCount + bu.quantity)
        } else {
          const byPerson = new Map<number, number>()
          byPerson.set(bu.person_number, bu.quantity)
          upsellMap.set(bu.upsell_id, {
            name: bu.upsell?.name || 'Unknown',
            count: bu.quantity,
            total: bu.price_total || 0,
            byPerson,
          })
        }
      })
    })
    return Array.from(upsellMap.values())
  }, [bookings])

  const servicesUsed = useMemo(() => {
    const serviceMap = new Map<string, { name: string; category: string; count: number; total: number }>()
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
          category: booking.service.category || '',
          count: 1,
          total: paid,
        })
      }
    })
    return Array.from(serviceMap.values()).sort((a, b) => b.count - a.count)
  }, [bookings])

  const totalVoucherSavings = useMemo(() => {
    return voucherUsage.reduce((sum, v) => sum + (v.discount_applied || 0), 0)
  }, [voucherUsage])

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending_payment: 'bg-amber-100 text-amber-800',
      confirmed: 'bg-blue-100 text-blue-800',
      completed: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800',
      cancelled_expired: 'bg-red-100 text-red-800',
      expired: 'bg-gray-200 text-gray-700',
      no_show: 'bg-gray-200 text-gray-700',
    }
    return styles[status] || 'bg-gray-100 text-gray-800'
  }

  const getPaymentStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      complete: 'bg-green-100 text-green-800',
      pending: 'bg-amber-100 text-amber-800',
      initiated: 'bg-gray-100 text-gray-700',
      failed: 'bg-red-100 text-red-800',
      cancelled: 'bg-red-100 text-red-800',
    }
    return styles[status] || 'bg-gray-100 text-gray-800'
  }

  const formatStatus = (status: string) => {
    return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  }

  const displayedBookings = useMemo(() => {
    switch (activeTab) {
      case 'upcoming':
        return upcomingBookings
      case 'completed':
        return completedBookings
      case 'all':
      default:
        return bookings
    }
  }, [activeTab, bookings, upcomingBookings, completedBookings])

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

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between">
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
              <div className="flex flex-wrap items-center gap-4 mt-1">
                {customer.email && (
                  <a href={`mailto:${customer.email}`} className="text-gray-600 hover:text-gray-900 flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    {customer.email}
                  </a>
                )}
                {customer.phone && (
                  <a href={`tel:${customer.phone}`} className="text-gray-600 hover:text-gray-900 flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    {customer.phone}
                  </a>
                )}
                {customer.date_of_birth && (
                  <span className="text-gray-600 flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    {new Date(customer.date_of_birth).toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' })}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowManualBooking(true)}
              className="px-4 py-2 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Booking
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl shadow-sm p-5">
            <p className="text-sm text-gray-600 mb-1">Total Spent</p>
            <p className="text-2xl font-bold text-gray-900">R{totalSpent.toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5">
            <p className="text-sm text-gray-600 mb-1">Total Bookings</p>
            <p className="text-2xl font-bold text-gray-900">{bookings.length}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5">
            <p className="text-sm text-gray-600 mb-1">Last Visit</p>
            <p className="text-lg font-semibold text-gray-900">
              {lastVisit
                ? new Date(lastVisit.start_time).toLocaleDateString('en-ZA', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })
                : 'Never'}
            </p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5">
            <p className="text-sm text-gray-600 mb-1">Client Since</p>
            <p className="text-lg font-semibold text-gray-900">
              {new Date(customer.created_at).toLocaleDateString('en-ZA', {
                month: 'short',
                year: 'numeric',
              })}
            </p>
          </div>
        </div>

        {upcomingBookings.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <h2 className="text-lg font-semibold text-blue-900">Upcoming Appointment</h2>
            </div>
            <button
              onClick={() => setSelectedBookingId(upcomingBookings[0].id)}
              className="w-full bg-white rounded-lg p-4 hover:bg-blue-100 transition-colors text-left"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">{upcomingBookings[0].service?.name}</p>
                  <p className="text-sm text-gray-600">
                    {new Date(upcomingBookings[0].start_time).toLocaleDateString('en-ZA', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                    })} at {new Date(upcomingBookings[0].start_time).toLocaleTimeString('en-ZA', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
                <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${getStatusBadge(upcomingBookings[0].status)}`}>
                  {formatStatus(upcomingBookings[0].status)}
                </span>
              </div>
            </button>
            {upcomingBookings.length > 1 && (
              <p className="text-sm text-blue-700 mt-2">+ {upcomingBookings.length - 1} more upcoming</p>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-xl shadow-sm">
              <div className="border-b">
                <div className="flex">
                  {[
                    { key: 'all', label: 'All Bookings', count: bookings.length },
                    { key: 'upcoming', label: 'Upcoming', count: upcomingBookings.length },
                    { key: 'completed', label: 'Completed', count: completedBookings.length },
                    { key: 'payments', label: 'Payments', count: allPayments.length },
                  ].map((tab) => (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key as BookingTab)}
                      className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                        activeTab === tab.key
                          ? 'border-gray-900 text-gray-900'
                          : 'border-transparent text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      {tab.label} ({tab.count})
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-4">
                {activeTab === 'payments' ? (
                  allPayments.length === 0 ? (
                    <p className="text-gray-600 py-4 text-center">No payment transactions yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {allPayments.map(({ transaction, booking }) => (
                        <button
                          key={transaction.id}
                          onClick={() => setSelectedBookingId(booking.id)}
                          className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors text-left"
                        >
                          <div>
                            <p className="font-medium text-gray-900">R{transaction.amount?.toLocaleString()}</p>
                            <p className="text-sm text-gray-600">
                              {booking.service?.name} - {new Date(transaction.created_at).toLocaleDateString('en-ZA')}
                            </p>
                            {transaction.payment_method && (
                              <p className="text-xs text-gray-500 capitalize">{transaction.payment_method}</p>
                            )}
                          </div>
                          <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${getPaymentStatusBadge(transaction.status)}`}>
                            {formatStatus(transaction.status)}
                          </span>
                        </button>
                      ))}
                    </div>
                  )
                ) : displayedBookings.length === 0 ? (
                  <p className="text-gray-600 py-4 text-center">No bookings found.</p>
                ) : (
                  <div className="space-y-2">
                    {displayedBookings.map((booking) => (
                      <button
                        key={booking.id}
                        onClick={() => setSelectedBookingId(booking.id)}
                        className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors text-left"
                      >
                        <div>
                          <p className="font-medium text-gray-900">{booking.service?.name}</p>
                          <p className="text-sm text-gray-600">
                            {new Date(booking.start_time).toLocaleDateString('en-ZA', {
                              weekday: 'short',
                              day: 'numeric',
                              month: 'short',
                            })} at {new Date(booking.start_time).toLocaleTimeString('en-ZA', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                            {booking.people_count > 1 && ` - ${booking.people_count} people`}
                          </p>
                          {booking.booking_upsells?.length > 0 && (
                            <p className="text-xs text-gray-500 mt-1">
                              + {booking.booking_upsells.length} add-on{booking.booking_upsells.length !== 1 ? 's' : ''}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-medium text-gray-900">R{booking.total_price?.toLocaleString()}</span>
                          <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${getStatusBadge(booking.status)}`}>
                            {formatStatus(booking.status)}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Health & Preferences</h2>
                {!editMode ? (
                  <button
                    onClick={() => setEditMode(true)}
                    className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Date of Birth</label>
                    <input
                      type="date"
                      value={editData.date_of_birth}
                      onChange={(e) => setEditData({ ...editData, date_of_birth: e.target.value })}
                      max={new Date().toISOString().split('T')[0]}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">Allergies</label>
                    <textarea
                      value={editData.allergies}
                      onChange={(e) => setEditData({ ...editData, allergies: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
                      rows={2}
                      placeholder="Any known allergies..."
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Medical Notes</label>
                    <textarea
                      value={editData.medical_notes}
                      onChange={(e) => setEditData({ ...editData, medical_notes: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
                      rows={2}
                      placeholder="Any medical conditions or concerns..."
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Private Notes (Staff Only)</label>
                    <textarea
                      value={editData.private_notes}
                      onChange={(e) => setEditData({ ...editData, private_notes: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
                      rows={2}
                      placeholder="Internal notes about this client..."
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Allergies</p>
                    <p className="text-gray-900">{customer.allergies || 'None recorded'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Preferred Massage Pressure</p>
                    <p className="text-gray-900 capitalize">{customer.massage_pressure || 'Medium'}</p>
                  </div>
                  <div className="md:col-span-2">
                    <p className="text-sm text-gray-600 mb-1">Medical Notes</p>
                    <p className="text-gray-900">{customer.medical_notes || 'None recorded'}</p>
                  </div>
                  {customer.private_notes && (
                    <div className="md:col-span-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
                      <p className="text-xs font-medium text-amber-800 mb-1">Staff Notes</p>
                      <p className="text-gray-900">{customer.private_notes}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            {servicesUsed.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Services Booked</h2>
                <div className="space-y-3">
                  {servicesUsed.map((service, idx) => (
                    <div key={idx} className="flex justify-between items-start">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{service.name}</p>
                        <p className="text-xs text-gray-500">{service.category}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-gray-900">{service.count}x</p>
                        <p className="text-xs text-gray-500">R{service.total.toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {allUpsells.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Add-ons History</h2>
                <div className="space-y-3">
                  {allUpsells.map((upsell, idx) => (
                    <div key={idx} className="flex justify-between items-start">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{upsell.name}</p>
                        <p className="text-xs text-gray-500">{upsell.count} time{upsell.count !== 1 ? 's' : ''}</p>
                      </div>
                      <p className="text-sm font-medium text-gray-900">R{upsell.total.toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {voucherUsage.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Voucher Usage</h2>
                <div className="mb-3 pb-3 border-b">
                  <p className="text-sm text-gray-600">Total Savings</p>
                  <p className="text-xl font-bold text-green-600">R{totalVoucherSavings.toLocaleString()}</p>
                </div>
                <div className="space-y-3">
                  {voucherUsage.map((usage) => (
                    <div key={usage.id} className="text-sm">
                      <div className="flex justify-between">
                        <span className="font-medium text-gray-900">{usage.voucher?.code}</span>
                        <span className="text-green-600">-R{usage.discount_applied?.toLocaleString()}</span>
                      </div>
                      <p className="text-xs text-gray-500">
                        {usage.booking?.service?.name} - {new Date(usage.created_at).toLocaleDateString('en-ZA')}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Activity Notes</h2>
              <div className="space-y-3">
                {clientNotes.length > 0 ? (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {clientNotes.map((note) => (
                      <div key={note.id} className="bg-gray-50 rounded-lg p-3 group relative">
                        <p className="text-sm text-gray-900 pr-6">{note.note}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {new Date(note.created_at).toLocaleString('en-ZA', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                        <button
                          onClick={() => handleDeleteNote(note.id)}
                          className="absolute top-2 right-2 p-1 text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No notes yet</p>
                )}
                <div className="flex gap-2 pt-2">
                  <input
                    type="text"
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddNote()}
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

      {showManualBooking && (
        <ManualBookingModal
          onClose={() => setShowManualBooking(false)}
          onSuccess={() => {
            setShowManualBooking(false)
            fetchData()
          }}
          prefillCustomerId={customer.id}
        />
      )}
    </AdminLayout>
  )
}
