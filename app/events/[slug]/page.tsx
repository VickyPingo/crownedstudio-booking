'use client'

import { useState, useEffect, use } from 'react'
import { supabase } from '@/lib/supabase/client'
import type { Event } from '@/types/event'
import type { Voucher } from '@/types/voucher'

interface EventPageProps {
  params: Promise<{ slug: string }>
}

type BookingStep = 'details' | 'payment'

interface BookingFormData {
  quantity: number
  name: string
  email: string
  phone: string
}

interface SavedBooking {
  id: string
  eventId: string
  eventTitle: string
  quantity: number
  subtotalAmount: number
  voucherDiscount: number
  totalAmount: number
  paymentStatus: string
  bookingStatus: string
}

export default function EventBookingPage({ params }: EventPageProps) {
  const { slug } = use(params)
  const [event, setEvent] = useState<Event | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState<BookingStep>('details')

  const [formData, setFormData] = useState<BookingFormData>({
    quantity: 1,
    name: '',
    email: '',
    phone: '',
  })

  const [voucherCode, setVoucherCode] = useState('')
  const [voucherLoading, setVoucherLoading] = useState(false)
  const [voucherError, setVoucherError] = useState('')
  const [appliedVoucher, setAppliedVoucher] = useState<Voucher | null>(null)
  const [voucherDiscount, setVoucherDiscount] = useState(0)

  const [savedBooking, setSavedBooking] = useState<SavedBooking | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isInitiatingPayment, setIsInitiatingPayment] = useState(false)

  useEffect(() => {
    async function fetchEvent() {
      const { data, error: fetchError } = await supabase
        .from('events')
        .select('*')
        .eq('slug', slug)
        .eq('is_active', true)
        .maybeSingle()

      if (fetchError) {
        setError('Failed to load event')
      } else if (!data) {
        setError('Event not found')
      } else {
        setEvent(data)
      }
      setLoading(false)
    }
    fetchEvent()
  }, [slug])

  const subtotal = event ? event.price_per_person * formData.quantity : 0
  const totalAmount = Math.max(0, subtotal - voucherDiscount)

  const calculateVoucherDiscount = (voucher: Voucher, amount: number): number => {
    let discount: number
    if (voucher.discount_type === 'fixed') {
      discount = voucher.discount_value
    } else {
      discount = Math.round((amount * voucher.discount_value) / 100)
    }
    return Math.min(discount, amount)
  }

  const handleApplyVoucher = async () => {
    if (!voucherCode.trim()) {
      setVoucherError('Please enter a voucher code')
      return
    }

    setVoucherLoading(true)
    setVoucherError('')

    const { data: voucher, error: vError } = await supabase
      .from('vouchers')
      .select('*')
      .eq('code', voucherCode.toUpperCase().trim())
      .eq('is_active', true)
      .maybeSingle()

    if (vError || !voucher) {
      setVoucherError('Invalid voucher code')
      setVoucherLoading(false)
      return
    }

    if (voucher.expires_at && new Date(voucher.expires_at) < new Date()) {
      setVoucherError('This voucher has expired')
      setVoucherLoading(false)
      return
    }

    if (voucher.usage_limit && voucher.usage_count >= voucher.usage_limit) {
      setVoucherError('This voucher has reached its usage limit')
      setVoucherLoading(false)
      return
    }

    if (voucher.min_spend > subtotal) {
      setVoucherError(`Minimum spend of R${voucher.min_spend} required`)
      setVoucherLoading(false)
      return
    }

    const discount = calculateVoucherDiscount(voucher, subtotal)
    setAppliedVoucher(voucher)
    setVoucherDiscount(discount)
    setVoucherLoading(false)
  }

  const handleRemoveVoucher = () => {
    setAppliedVoucher(null)
    setVoucherDiscount(0)
    setVoucherCode('')
    setVoucherError('')
  }

  const handleContinueToPayment = () => {
    if (!formData.name || !formData.email || !formData.phone) {
      return
    }
    setStep('payment')
  }

  const handleCreateBooking = async () => {
    if (!event) return

    setIsSubmitting(true)

    try {
      const response = await fetch('/api/events/bookings/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventSlug: event.slug,
          bookerName: formData.name,
          bookerEmail: formData.email,
          bookerPhone: formData.phone,
          quantity: formData.quantity,
          voucherCode: appliedVoucher?.code || null,
          voucherDiscount: voucherDiscount,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to create booking')
      }

      const result = await response.json()

      if (result.success && result.booking) {
        setSavedBooking(result.booking)
      }
    } catch (err) {
      console.error('Booking creation error:', err)
      alert('Failed to create booking. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handlePayNow = async () => {
    if (!savedBooking) return

    setIsInitiatingPayment(true)

    try {
      const response = await fetch('/api/events/payment/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: savedBooking.id }),
      })

      if (!response.ok) {
        throw new Error('Failed to initiate payment')
      }

      const result = await response.json()

      if (result.success && result.paymentUrl) {
        window.location.href = result.paymentUrl
      }
    } catch (err) {
      console.error('Payment initiation error:', err)
      alert('Failed to initiate payment. Please try again.')
      setIsInitiatingPayment(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading event...</p>
        </div>
      </div>
    )
  }

  if (error || !event) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Event Not Found</h1>
          <p className="text-gray-600">{error || 'This event does not exist or is no longer available.'}</p>
        </div>
      </div>
    )
  }

  const eventDate = new Date(event.event_date)

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-2xl mx-auto px-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-6 bg-gray-900 text-white">
            <h1 className="text-2xl font-bold">{event.title}</h1>
            <p className="text-gray-300 mt-1">
              {eventDate.toLocaleDateString('en-ZA', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
              {' at '}
              {eventDate.toLocaleTimeString('en-ZA', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
            {event.description && (
              <p className="text-gray-400 mt-2 text-sm">{event.description}</p>
            )}
          </div>

          <div className="p-6">
            {step === 'details' && (
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Number of People
                  </label>
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => setFormData(prev => ({ ...prev, quantity: Math.max(1, prev.quantity - 1) }))}
                      className="w-10 h-10 rounded-lg border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-50"
                    >
                      -
                    </button>
                    <span className="text-xl font-semibold text-gray-900 w-12 text-center">
                      {formData.quantity}
                    </span>
                    <button
                      onClick={() => setFormData(prev => ({ ...prev, quantity: prev.quantity + 1 }))}
                      className="w-10 h-10 rounded-lg border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-50"
                    >
                      +
                    </button>
                    <span className="text-gray-500 text-sm">
                      @ R{event.price_per_person} per person
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400"
                    placeholder="Your full name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400"
                    placeholder="your@email.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400"
                    placeholder="072 123 4567"
                  />
                </div>

                <button
                  onClick={handleContinueToPayment}
                  disabled={!formData.name || !formData.email || !formData.phone}
                  className="w-full bg-gray-900 text-white py-3 px-6 rounded-lg font-semibold hover:bg-gray-800 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  Continue to Payment
                </button>
              </div>
            )}

            {step === 'payment' && (
              <div className="space-y-6">
                <button
                  onClick={() => setStep('details')}
                  className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Back to details
                </button>

                <div className="border border-gray-200 rounded-lg divide-y divide-gray-200">
                  <div className="p-4">
                    <h3 className="font-semibold text-gray-900 mb-2">Booking Summary</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Event</span>
                        <span className="text-gray-900 font-medium">{event.title}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Quantity</span>
                        <span className="text-gray-900">{formData.quantity} {formData.quantity === 1 ? 'person' : 'people'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Price per person</span>
                        <span className="text-gray-900">R{event.price_per_person}</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-4">
                    <h3 className="font-semibold text-gray-900 mb-2">Contact Details</h3>
                    <div className="space-y-1 text-sm">
                      <p className="text-gray-800">{formData.name}</p>
                      <p className="text-gray-600">{formData.email}</p>
                      <p className="text-gray-600">{formData.phone}</p>
                    </div>
                  </div>

                  {!savedBooking && (
                    <div className="p-4">
                      <h3 className="font-semibold text-gray-900 mb-3">Voucher Code</h3>
                      {appliedVoucher ? (
                        <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
                          <div>
                            <p className="font-medium text-green-800">{appliedVoucher.code}</p>
                            <p className="text-sm text-green-700">
                              {appliedVoucher.discount_type === 'fixed'
                                ? `R${appliedVoucher.discount_value} off`
                                : `${appliedVoucher.discount_value}% off`}
                            </p>
                          </div>
                          <button
                            onClick={handleRemoveVoucher}
                            className="text-sm text-green-700 hover:text-green-900 font-medium"
                          >
                            Remove
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={voucherCode}
                              onChange={(e) => {
                                setVoucherCode(e.target.value.toUpperCase())
                                setVoucherError('')
                              }}
                              placeholder="Enter voucher code"
                              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 uppercase"
                            />
                            <button
                              onClick={handleApplyVoucher}
                              disabled={voucherLoading}
                              className="px-4 py-2 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 disabled:opacity-50"
                            >
                              {voucherLoading ? '...' : 'Apply'}
                            </button>
                          </div>
                          {voucherError && (
                            <p className="text-sm text-red-600">{voucherError}</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="p-4 bg-gray-50">
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Subtotal</span>
                        <span className="text-gray-900">R{subtotal}</span>
                      </div>
                      {voucherDiscount > 0 && (
                        <div className="flex justify-between text-sm text-green-700">
                          <span>Voucher Discount</span>
                          <span>-R{voucherDiscount}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-semibold text-lg pt-2 border-t border-gray-200">
                        <span className="text-gray-900">Total</span>
                        <span className="text-gray-900">R{totalAmount}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {savedBooking && savedBooking.bookingStatus === 'confirmed' ? (
                  <div className="border border-green-300 bg-green-50 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-green-700 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <div>
                        <h4 className="font-semibold text-green-900 mb-1">Booking Confirmed</h4>
                        <p className="text-sm text-green-800">
                          Reference: <span className="font-mono font-semibold">{savedBooking.id.slice(0, 8).toUpperCase()}</span>
                        </p>
                      </div>
                    </div>
                  </div>
                ) : savedBooking ? (
                  <button
                    onClick={handlePayNow}
                    disabled={isInitiatingPayment}
                    className="w-full bg-green-700 text-white py-3 px-6 rounded-lg font-semibold hover:bg-green-800 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    {isInitiatingPayment ? 'Redirecting to PayFast...' : `Pay R${savedBooking.totalAmount}`}
                  </button>
                ) : (
                  <button
                    onClick={handleCreateBooking}
                    disabled={isSubmitting}
                    className="w-full bg-gray-900 text-white py-3 px-6 rounded-lg font-semibold hover:bg-gray-800 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    {isSubmitting
                      ? 'Creating Booking...'
                      : totalAmount === 0
                        ? 'Confirm Booking'
                        : 'Continue to Payment'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
