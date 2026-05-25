'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function SuccessContent() {
  const searchParams = useSearchParams()
  const code = searchParams.get('code')

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        <div className="text-center">

          <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-4">
            <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Gift Voucher Purchased!
          </h1>
          <p className="text-gray-600 mb-6 text-sm leading-relaxed">
            Your payment is being confirmed. You'll receive a confirmation email with your voucher code shortly.
          </p>

          {code && (
            <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl p-6 mb-6">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-widest mb-2">
                Your Gift Voucher Code
              </p>
              <p className="text-3xl font-mono font-bold text-gray-900 tracking-wider">{code}</p>
              <p className="text-xs text-gray-400 mt-2">
                Save this code — it will also be emailed to you
              </p>
            </div>
          )}

          <div className="text-left bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 space-y-2">
            <p className="text-xs font-semibold text-amber-900 uppercase tracking-wide">How to redeem</p>
            <p className="text-sm text-amber-800">1. Go to the service booking page</p>
            <p className="text-sm text-amber-800">2. Select your preferred date and time</p>
            <p className="text-sm text-amber-800">3. Enter the voucher code at checkout</p>
            <p className="text-sm text-amber-800">4. Confirm your booking — it's fully paid!</p>
          </div>

          <a
            href="https://crownedstudio.co.za/"
            className="inline-block bg-gray-900 text-white px-8 py-3 rounded-lg font-semibold hover:bg-gray-800 transition-colors"
          >
            Return to Home
          </a>
        </div>
      </div>
    </div>
  )
}

export default function GiftVoucherSuccessPage() {
  return (
    <Suspense>
      <SuccessContent />
    </Suspense>
  )
}
