'use client'

import { BookingFormData, MOCK_UPSELLS } from '@/types/booking'

interface Service {
  id: string
  name: string
  slug: string
  description: string
}

interface PaymentStepProps {
  service: Service
  formData: BookingFormData
}

export function PaymentStep({ service, formData }: PaymentStepProps) {
  const servicePrice = 1500

  const selectedUpsellsData = MOCK_UPSELLS.filter((upsell) =>
    formData.selectedUpsells.includes(upsell.id)
  )

  const upsellsTotal = selectedUpsellsData.reduce((sum, upsell) => sum + upsell.price, 0)
  const totalAmount = servicePrice + upsellsTotal
  const depositAmount = Math.round(totalAmount * 0.5)

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
            <p className="font-semibold">R{servicePrice}</p>
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
              <span>Subtotal</span>
              <span>R{totalAmount}</span>
            </div>
            <div className="flex justify-between font-semibold text-lg pt-2 border-t">
              <span>Total Amount</span>
              <span>R{totalAmount}</span>
            </div>
            <div className="flex justify-between text-green-700 font-semibold pt-2 border-t border-green-200 bg-green-50 -mx-4 px-4 py-2 mt-2">
              <span>50% Deposit Required</span>
              <span>R{depositAmount}</span>
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
