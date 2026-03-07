'use client'

import { useBookingModal } from '@/hooks/useBookingModal'

export function BookingModal() {
  const { isOpen, selectedService, closeModal } = useBookingModal()

  if (!isOpen || !selectedService) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={closeModal}
      />

      <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 p-6">
        <button
          onClick={closeModal}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="space-y-4">
          <h2 className="text-2xl font-bold">Book Service</h2>

          <div className="border-t pt-4">
            <p className="text-sm text-gray-500">Selected Service:</p>
            <p className="text-xl font-semibold">{selectedService.name}</p>
            <p className="text-sm text-gray-600 mt-2">{selectedService.description}</p>
            <p className="text-sm text-gray-400 mt-1">Slug: {selectedService.slug}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
