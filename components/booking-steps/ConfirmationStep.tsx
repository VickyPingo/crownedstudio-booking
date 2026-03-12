'use client'

export function ConfirmationStep() {
  return (
    <div className="space-y-6 text-center py-8">
      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
        <svg className="w-8 h-8 text-green-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>

      <div>
        <h3 className="text-2xl font-bold text-gray-900 mb-2">Booking Confirmed!</h3>
        <p className="text-gray-700">
          Your booking has been successfully processed
        </p>
      </div>

      <div className="bg-blue-50 border border-blue-300 rounded-lg p-4 text-left">
        <h4 className="font-semibold text-blue-900 mb-2">What happens next?</h4>
        <ul className="space-y-2 text-sm text-blue-900">
          <li className="flex items-start">
            <span className="mr-2 font-medium">1.</span>
            <span>You will receive a confirmation email with your booking details</span>
          </li>
          <li className="flex items-start">
            <span className="mr-2 font-medium">2.</span>
            <span>A reminder will be sent 24 hours before your appointment</span>
          </li>
          <li className="flex items-start">
            <span className="mr-2 font-medium">3.</span>
            <span>Please arrive 10 minutes early for your scheduled time</span>
          </li>
        </ul>
      </div>

      <p className="text-sm text-gray-700">
        If you have any questions, please contact us at info@crownedstudio.com
      </p>
    </div>
  )
}
