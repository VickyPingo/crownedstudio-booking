'use client'

import { useState, useEffect } from 'react'
import { useBookingModal } from '@/hooks/useBookingModal'
import { ServiceDetailsStep } from './booking-steps/ServiceDetailsStep'
import { UpsellsStep } from './booking-steps/UpsellsStep'
import { DateTimeStep } from './booking-steps/DateTimeStep'
import { ClientDetailsStep } from './booking-steps/ClientDetailsStep'
import { PaymentStep } from './booking-steps/PaymentStep'
import { ConfirmationStep } from './booking-steps/ConfirmationStep'
import { BookingFormData } from '@/types/booking'
import { ServiceWithUpsells } from '@/types/service'

const STEPS = [
  { id: 'service', label: 'Service Details' },
  { id: 'upsells', label: 'Upsells' },
  { id: 'datetime', label: 'Date & Time' },
  { id: 'client', label: 'Client Details' },
  { id: 'payment', label: 'Payment' },
  { id: 'confirmation', label: 'Confirmation' },
]

export function BookingModal({ services }: { services: ServiceWithUpsells[] }) {
  const { isOpen, selectedService, serviceSlug, closeModal } = useBookingModal()
  const [currentStep, setCurrentStep] = useState(0)
  const [formData, setFormData] = useState<BookingFormData>({
    peopleCount: 1,
    selectedUpsells: [],
    selectedDate: '',
    selectedTime: '',
    clientName: '',
    clientEmail: '',
    clientPhone: '',
  })
  const [resolvedService, setResolvedService] = useState<ServiceWithUpsells | null>(null)

  useEffect(() => {
    if (selectedService) {
      setResolvedService(selectedService)
    } else if (serviceSlug) {
      const service = services.find((s) => s.slug === serviceSlug)
      setResolvedService(service || null)
    } else {
      setResolvedService(null)
    }
  }, [selectedService, serviceSlug, services])

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }

    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  if (!isOpen || !resolvedService) return null

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
      peopleCount: 1,
      selectedUpsells: [],
      selectedDate: '',
      selectedTime: '',
      clientName: '',
      clientEmail: '',
      clientPhone: '',
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
        return (
          <ServiceDetailsStep
            service={resolvedService}
            peopleCount={formData.peopleCount}
            onUpdatePeopleCount={(count) => updateFormData({ peopleCount: count })}
          />
        )
      case 1:
        return (
          <UpsellsStep
            availableUpsells={resolvedService.upsells}
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
            onUpdateClient={(updates) => updateFormData(updates)}
          />
        )
      case 4:
        return <PaymentStep service={resolvedService} formData={formData} />
      case 5:
        return <ConfirmationStep />
      default:
        return null
    }
  }

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />

      <div className="absolute inset-0 overflow-y-auto">
        <div className="flex min-h-full items-start sm:items-center justify-center p-3 sm:p-6">
          <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-xl max-h-[92vh] flex flex-col">
            <button
              onClick={handleClose}
              className="absolute right-4 top-4 z-10 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              aria-label="Close booking modal"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <div className="border-b px-4 py-4 sm:px-6">
              <h2 className="pr-10 text-xl font-bold sm:text-2xl">Book Service</h2>

              <div className="mt-4">
                <div className="mb-2 text-sm font-medium text-gray-600">
                  Step {currentStep + 1} of {STEPS.length}: {STEPS[currentStep].label}
                </div>

                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {STEPS.map((step, index) => (
                    <div key={step.id} className="flex min-w-fit items-center gap-2">
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-medium ${
                          index === currentStep
                            ? 'bg-black text-white'
                            : index < currentStep
                            ? 'bg-green-500 text-white'
                            : 'bg-gray-200 text-gray-600'
                        }`}
                      >
                        {index < currentStep ? '✓' : index + 1}
                      </div>

                      <span
                        className={`hidden text-xs sm:inline ${
                          index === currentStep ? 'font-semibold text-black' : 'text-gray-500'
                        }`}
                      >
                        {step.label}
                      </span>

                      {index < STEPS.length - 1 && <div className="h-px w-6 bg-gray-300 sm:w-8" />}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
              <div className="min-h-[200px]">{renderStep()}</div>
            </div>

            <div className="border-t bg-white px-4 py-4 sm:px-6">
              <div className="flex gap-3 sm:justify-between">
                <button
                  onClick={handleBack}
                  disabled={currentStep === 0}
                  className={`flex-1 sm:flex-none px-5 py-3 rounded-lg font-medium ${
                    currentStep === 0
                      ? 'cursor-not-allowed bg-gray-200 text-gray-400'
                      : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
                  }`}
                >
                  Back
                </button>

                <button
                  onClick={handleNext}
                  disabled={currentStep === STEPS.length - 1 || !canProceedToNext()}
                  className={`flex-1 sm:flex-none px-5 py-3 rounded-lg font-medium ${
                    currentStep === STEPS.length - 1 || !canProceedToNext()
                      ? 'cursor-not-allowed bg-gray-200 text-gray-400'
                      : 'bg-black text-white hover:bg-gray-800'
                  }`}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
