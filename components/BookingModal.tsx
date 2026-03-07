'use client'

import { useState } from 'react'
import { useBookingModal } from '@/hooks/useBookingModal'
import { ServiceDetailsStep } from './booking-steps/ServiceDetailsStep'
import { UpsellsStep } from './booking-steps/UpsellsStep'
import { DateTimeStep } from './booking-steps/DateTimeStep'
import { ClientDetailsStep } from './booking-steps/ClientDetailsStep'
import { PaymentStep } from './booking-steps/PaymentStep'
import { ConfirmationStep } from './booking-steps/ConfirmationStep'
import { BookingFormData } from '@/types/booking'

const STEPS = [
  { id: 'service', label: 'Service Details' },
  { id: 'upsells', label: 'Upsells' },
  { id: 'datetime', label: 'Date & Time' },
  { id: 'client', label: 'Client Details' },
  { id: 'payment', label: 'Payment' },
  { id: 'confirmation', label: 'Confirmation' },
]

export function BookingModal() {
  const { isOpen, selectedService, closeModal } = useBookingModal()
  const [currentStep, setCurrentStep] = useState(0)
  const [formData, setFormData] = useState<BookingFormData>({
    selectedUpsells: [],
    selectedDate: '',
    selectedTime: '',
    clientName: '',
    clientEmail: '',
    clientPhone: '',
    isRepeatCustomer: false,
  })

  if (!isOpen || !selectedService) return null

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1)
    }
  }

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleClose = () => {
    setCurrentStep(0)
    setFormData({
      selectedUpsells: [],
      selectedDate: '',
      selectedTime: '',
      clientName: '',
      clientEmail: '',
      clientPhone: '',
      isRepeatCustomer: false,
    })
    closeModal()
  }

  const updateFormData = (updates: Partial<BookingFormData>) => {
    setFormData((prev) => ({ ...prev, ...updates }))
  }

  const canProceedToNext = () => {
    switch (currentStep) {
      case 3:
        return (
          formData.clientName.trim() !== '' &&
          formData.clientEmail.trim() !== '' &&
          formData.clientPhone.trim() !== ''
        )
      default:
        return true
    }
  }

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return <ServiceDetailsStep service={selectedService} />
      case 1:
        return (
          <UpsellsStep
            selectedUpsells={formData.selectedUpsells}
            onUpdateUpsells={(upsells) => updateFormData({ selectedUpsells: upsells })}
          />
        )
      case 2:
        return (
          <DateTimeStep
            selectedDate={formData.selectedDate}
            selectedTime={formData.selectedTime}
            onUpdateDate={(date) => updateFormData({ selectedDate: date })}
            onUpdateTime={(time) => updateFormData({ selectedTime: time })}
          />
        )
      case 3:
        return (
          <ClientDetailsStep
            clientName={formData.clientName}
            clientEmail={formData.clientEmail}
            clientPhone={formData.clientPhone}
            isRepeatCustomer={formData.isRepeatCustomer}
            onUpdateClient={(updates) => updateFormData(updates)}
          />
        )
      case 4:
        return (
          <PaymentStep
            service={selectedService}
            formData={formData}
          />
        )
      case 5:
        return <ConfirmationStep />
      default:
        return null
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={handleClose}
      />

      <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 p-6">
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="space-y-6">
          <h2 className="text-2xl font-bold">Book Service</h2>

          <div className="flex items-center justify-between">
            {STEPS.map((step, index) => (
              <div key={step.id} className="flex items-center flex-1">
                <div className="flex flex-col items-center flex-1">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                      index === currentStep
                        ? 'bg-black text-white'
                        : index < currentStep
                        ? 'bg-green-500 text-white'
                        : 'bg-gray-200 text-gray-600'
                    }`}
                  >
                    {index < currentStep ? '✓' : index + 1}
                  </div>
                  <p className="text-xs mt-1 text-center hidden sm:block">{step.label}</p>
                </div>
                {index < STEPS.length - 1 && (
                  <div
                    className={`h-0.5 flex-1 ${
                      index < currentStep ? 'bg-green-500' : 'bg-gray-200'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>

          <div className="border-t pt-6 min-h-[200px]">
            {renderStep()}
          </div>

          <div className="flex justify-between pt-4 border-t">
            <button
              onClick={handleBack}
              disabled={currentStep === 0}
              className={`px-6 py-2 rounded-lg ${
                currentStep === 0
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
              }`}
            >
              Back
            </button>

            <button
              onClick={handleNext}
              disabled={currentStep === STEPS.length - 1 || !canProceedToNext()}
              className={`px-6 py-2 rounded-lg ${
                currentStep === STEPS.length - 1 || !canProceedToNext()
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-black text-white hover:bg-gray-800'
              }`}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
