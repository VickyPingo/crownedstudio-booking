'use client'

import { useState } from 'react'

interface Service {
  id: string
  name: string
  slug: string
  description: string | null
  price_1_person: number
  price_2_people: number
  price_3_people: number
  price_4_people: number
  price_5_people: number
  price_6_people: number
  max_people: number
  duration_minutes: number
}

interface GiftVoucherPageClientProps {
  service: Service
}

function getPriceForPeopleCount(service: Service, count: number): number {
  switch (count) {
    case 1: return service.price_1_person
    case 2: return service.price_2_people
    case 3: return service.price_3_people
    case 4: return service.price_4_people
    case 5: return service.price_5_people
    case 6: return service.price_6_people
    default: return service.price_1_person
  }
}

export function GiftVoucherPageClient({ service }: GiftVoucherPageClientProps) {
  const [peopleCount, setPeopleCount] = useState(1)
  const [purchaserName, setPurchaserName] = useState('')
  const [purchaserEmail, setPurchaserEmail] = useState('')
  const [recipientName, setRecipientName] = useState('')
  const [recipientEmail, setRecipientEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const price = getPriceForPeopleCount(service, peopleCount)
  const maxPeople = Math.min(service.max_people, 6)

  const canSubmit =
    purchaserName.trim() !== '' &&
    purchaserEmail.trim() !== '' &&
    !isSubmitting

  const handlePurchase = async () => {
    if (!canSubmit) return
    setError('')
    setIsSubmitting(true)

    try {
      const response = await fetch('/api/gift-vouchers/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceSlug: service.slug,
          serviceName: service.name,
          peopleCount,
          amountPaid: price,
          purchaserName: purchaserName.trim(),
          purchaserEmail: purchaserEmail.trim().toLowerCase(),
          recipientName: recipientName.trim() || null,
          recipientEmail: recipientEmail.trim().toLowerCase() || null,
        }),
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        setError(result.error || 'Failed to create gift voucher. Please try again.')
        setIsSubmitting(false)
        return
      }

      // Redirect to PayFast
      window.location.href = result.paymentUrl
    } catch (err) {
      console.error('Gift voucher purchase error:', err)
      setError('Something went wrong. Please try again.')
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-xl mx-auto px-4">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">🎁</div>
          <h1 className="text-3xl font-bold text-gray-900">Gift Voucher</h1>
          <p className="text-gray-600 mt-2">Give the gift of relaxation</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">

          {/* Service summary */}
          <div className="bg-gray-900 text-white px-6 py-5">
            <h2 className="text-xl font-semibold">{service.name}</h2>
            <p className="text-gray-400 text-sm mt-1">{service.duration_minutes} minutes</p>
            {service.description && (
              <p className="text-gray-300 text-sm mt-2">{service.description}</p>
            )}
          </div>

          <div className="p-6 space-y-6">

            {/* People count */}
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-3">
                Number of People
              </label>
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: maxPeople }, (_, i) => i + 1).map((num) => {
                  const p = getPriceForPeopleCount(service, num)
                  if (!p || p <= 0) return null
                  return (
                    <button
                      key={num}
                      onClick={() => setPeopleCount(num)}
                      className={`px-4 py-3 rounded-xl border-2 text-center transition-all ${
                        peopleCount === num
                          ? 'border-gray-900 bg-gray-900 text-white'
                          : 'border-gray-200 bg-white text-gray-800 hover:border-gray-400'
                      }`}
                    >
                      <p className="font-semibold text-sm">{num} {num === 1 ? 'person' : 'people'}</p>
                      <p className="text-xs mt-0.5 opacity-80">R{p.toLocaleString()}</p>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Purchaser details */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">
                Your Details
              </h3>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Your Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={purchaserName}
                  onChange={(e) => setPurchaserName(e.target.value)}
                  placeholder="Jane Smith"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Your Email Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={purchaserEmail}
                  onChange={(e) => setPurchaserEmail(e.target.value)}
                  placeholder="jane@example.com"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
              </div>
            </div>

            {/* Recipient details (optional) */}
            <div className="space-y-4 pt-2 border-t border-gray-100">
              <div>
                <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">
                  Gift Recipient <span className="text-gray-400 font-normal normal-case">(optional)</span>
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  If this is a gift, we'll also send the voucher directly to the recipient.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Recipient's Name
                </label>
                <input
                  type="text"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  placeholder="Sarah Johnson"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Recipient's Email
                </label>
                <input
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="sarah@example.com"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
              </div>
            </div>

            {/* Price summary */}
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-700">
                  {service.name} — {peopleCount} {peopleCount === 1 ? 'person' : 'people'}
                </span>
                <span className="font-bold text-gray-900 text-lg">R{price.toLocaleString()}</span>
              </div>
              <p className="text-xs text-gray-500 mt-2">Valid for 6 months from purchase date</p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* Purchase button */}
            <button
              onClick={handlePurchase}
              disabled={!canSubmit}
              className="w-full py-4 bg-gray-900 text-white rounded-xl font-semibold text-base hover:bg-gray-800 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {isSubmitting
                ? 'Redirecting to payment...'
                : `Pay R${price.toLocaleString()} — Purchase Gift Voucher`}
            </button>

            <p className="text-xs text-gray-500 text-center">
              You'll be redirected to PayFast to complete your payment securely.
              The voucher code will be emailed once payment is confirmed.
            </p>
          </div>
        </div>

        {/* Back link */}
        <div className="text-center mt-6">
          <a
            href={`/booking/${service.slug}`}
            className="text-sm text-gray-600 hover:text-gray-900 underline"
          >
            Book this service instead →
          </a>
        </div>
      </div>
    </div>
  )
}
