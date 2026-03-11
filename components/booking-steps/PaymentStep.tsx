'use client'

import { useState } from 'react'
import { BookingFormData, CreateBookingPayload, BookingPricing } from '@/types/booking'
import { ServiceWithUpsells } from '@/types/service'
import { useBookingModal } from '@/hooks/useBookingModal'

interface PaymentStepProps {
  service: ServiceWithUpsells
  formData: BookingFormData
}

export function PaymentStep({ service, formData }: PaymentStepProps) {
  const [isCreatingBooking, setIsCreatingBooking] = useState(false)
  const [isInitiatingPayment, setIsInitiatingPayment] = useState(false)
  const { savedBooking, setSavedBooking } = useBookingModal()

  const servicePrice = service.price_1_person

  const selectedUpsellsData = service.upsells.filter((upsell) =>
    formData.selectedUpsells.includes(upsell.id)
  )

  const upsellsTotal = selectedUpsellsData.reduce((sum, upsell) => sum + upsell.price, 0)
  const subtotal = servicePrice + upsellsTotal

  const pricing: BookingPricing = savedBooking
    ? {
        servicePrice,
        upsellsTotal,
        subtotal,
        discountAmount: savedBooking.discountAmount,
        discountType: savedBooking.discountType,
        finalTotal: savedBooking.totalPrice,
        depositAmount: savedBooking.depositDue,
      }
    : {
        servicePrice,
        upsellsTotal,
        subtotal,
        discountAmount: 0,
        discountType: null,
        finalTotal: subtotal,
        depositAmount: Math.round(subtotal * 0.5),
      }

  const handleCreateBooking = async () => {
    if (savedBooking) {
      return
    }

    setIsCreatingBooking(true)

    try {
      const payload: CreateBookingPayload = {
        customerName: formData.clientName,
        customerEmail: formData.clientEmail,
        customerPhone: formData.clientPhone,
        serviceSlug: service.slug,
        selectedDate: formData.selectedDate,
        selectedTime: formData.selectedTime,
        durationMinutes: service.duration_minutes,
        peopleCount: 1,
        selectedUpsellIds: formData.selectedUpsells,
        basePrice: servicePrice,
        upsellsTotal: upsellsTotal,
        discountAmount: 0,
        discountType: null,
        totalPrice: subtotal,
        depositDue: Math.round(subtotal * 0.5),
      }

      const response = await fetch('/api/bookings/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        throw new Error('Failed to create booking')
      }

      const result = await response.json()

      if (result.success && result.booking) {
        setSavedBooking(result.booking)
      }
    } catch (error) {
      console.error('Error creating booking:', error)
      alert('Failed to create booking. Please try again.')
    } finally {
      setIsCreatingBooking(false)
    }
  }

  const handlePayDeposit = async () => {
    if (!savedBooking) {
      return
    }

    setIsInitiatingPayment(true)

    try {
      const response = await fetch('/api/payment/initiate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ bookingId: savedBooking.id }),
      })

      if (!response.ok) {
        throw new Error('Failed to initiate payment')
      }

      const result = await response.json()

      if (result.success && result.paymentUrl) {
        window.location.href = result.paymentUrl
      }
    } catch (error) {
      console.error('Error initiating payment:', error)
      alert('Failed to initiate payment. Please try again.')
      setIsInitiatingPayment(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold mb-2">Booking Summary</h3>
        <p className="text-sm text-gray-600">Review your booking details before payment</p>
      </div>

      <div className="border rounded-lg divide-y">
        <div className="p-4 bg-gray-50">
          <h4 className="font-semibold mb-2">Service</h4>
          <div className="flex justify-between items-start">
            <div>
              <p className="font-medium">{service.name}</p>
              <p className="text-sm text-gray-600">{service.description}</p>
            </div>
            <p className="font-semibold">R{pricing.servicePrice}</p>
          </div>
        </div>

        {selectedUpsellsData.length > 0 && (
          <div className="p-4">
            <h4 className="font-semibold mb-2">Additional Services</h4>
            <div className="space-y-2">
              {selectedUpsellsData.map((upsell) => (
                <div key={upsell.id} className="flex justify-between">
                  <p className="text-sm">{upsell.name}</p>
                  <p className="text-sm font-medium">R{upsell.price}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="p-4">
          <h4 className="font-semibold mb-2">Date & Time</h4>
          <p className="text-sm">
            {formData.selectedDate ? (
              <>
                {new Date(formData.selectedDate).toLocaleDateString('en-ZA', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
                {formData.selectedTime && ` at ${formData.selectedTime}`}
              </>
            ) : (
              'Not selected'
            )}
          </p>
        </div>

        <div className="p-4">
          <h4 className="font-semibold mb-2">Contact Details</h4>
          <div className="space-y-1 text-sm">
            <p><span className="text-gray-600">Name:</span> {formData.clientName}</p>
            <p><span className="text-gray-600">Email:</span> {formData.clientEmail}</p>
            <p><span className="text-gray-600">Phone:</span> {formData.clientPhone}</p>
          </div>
        </div>

        <div className="p-4 bg-gray-50">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Service Price</span>
              <span>R{pricing.servicePrice}</span>
            </div>

            {pricing.upsellsTotal > 0 && (
              <div className="flex justify-between text-sm">
                <span>Additional Services</span>
                <span>R{pricing.upsellsTotal}</span>
              </div>
            )}

            <div className="flex justify-between text-sm font-medium pt-2 border-t">
              <span>Subtotal</span>
              <span>R{pricing.subtotal}</span>
            </div>

            {pricing.discountAmount > 0 && pricing.discountType === 'repeat_customer' && (
              <div className="flex justify-between text-sm text-green-700 bg-green-50 -mx-4 px-4 py-2">
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Repeat Customer Discount (10%)
                </span>
                <span>-R{pricing.discountAmount}</span>
              </div>
            )}

            <div className="flex justify-between font-semibold text-lg pt-2 border-t">
              <span>Total Amount</span>
              <span>R{pricing.finalTotal}</span>
            </div>

            <div className="flex justify-between text-green-700 font-semibold pt-2 border-t border-green-200 bg-green-50 -mx-4 px-4 py-2 mt-2">
              <span>50% Deposit Required</span>
              <span>R{pricing.depositAmount}</span>
            </div>
          </div>
        </div>
      </div>

      {savedBooking && (
        <div className="border border-green-200 bg-green-50 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-green-700 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <div className="flex-1">
              <h4 className="font-semibold text-green-900 mb-1">Booking Created Successfully</h4>
              <p className="text-sm text-green-800 mb-2">
                Your booking reference: <span className="font-mono font-semibold">{savedBooking.id.slice(0, 8).toUpperCase()}</span>
              </p>
              <p className="text-xs text-green-700">
                Status: Awaiting Payment
              </p>
            </div>
          </div>
        </div>
      )}

      {!savedBooking ? (
        <button
          onClick={handleCreateBooking}
          disabled={isCreatingBooking}
          className="w-full bg-black text-white py-3 px-6 rounded-lg font-semibold hover:bg-gray-800 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {isCreatingBooking ? 'Creating Booking...' : 'Continue to Payment'}
        </button>
      ) : (
        <button
          onClick={handlePayDeposit}
          disabled={isInitiatingPayment}
          className="w-full bg-green-700 text-white py-3 px-6 rounded-lg font-semibold hover:bg-green-800 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {isInitiatingPayment ? 'Redirecting to PayFast...' : `Pay Deposit (R${pricing.depositAmount})`}
        </button>
      )}

      <p className="text-xs text-gray-500 text-center">
        {!savedBooking
          ? 'Your booking will be created and you will be redirected to payment'
          : 'You will be redirected to PayFast to complete your deposit payment'
        }
      </p>
    </div>
  )
}
