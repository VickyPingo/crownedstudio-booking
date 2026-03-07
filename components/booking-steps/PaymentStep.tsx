'use client'

import { BookingFormData, calculateBookingPricing } from '@/types/booking'
import { ServiceWithUpsells } from '@/types/service'

interface PaymentStepProps {
  service: ServiceWithUpsells
  formData: BookingFormData
}

export function PaymentStep({ service, formData }: PaymentStepProps) {
  const servicePrice = service.price_1_person

  const selectedUpsellsData = service.upsells.filter((upsell) =>
    formData.selectedUpsells.includes(upsell.id)
  )

  const pricing = calculateBookingPricing(
    servicePrice,
    selectedUpsellsData,
    formData.isRepeatCustomer
  )

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

      <button
        className="w-full bg-black text-white py-3 px-6 rounded-lg font-semibold hover:bg-gray-800 transition-colors"
      >
        Continue to Payment
      </button>

      <p className="text-xs text-gray-500 text-center">
        You will be redirected to our secure payment provider to complete your booking
      </p>
    </div>
  )
}
