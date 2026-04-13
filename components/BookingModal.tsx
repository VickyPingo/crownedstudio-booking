'use client'

import { useState, useEffect } from 'react'
import { useBookingModal } from '@/hooks/useBookingModal'
import { ServiceDetailsStep } from './booking-steps/ServiceDetailsStep'
import { PersonalisationStep } from './booking-steps/PersonalisationStep'
import { DateTimeStep } from './booking-steps/DateTimeStep'
import { ClientDetailsStep } from './booking-steps/ClientDetailsStep'
import { PaymentStep } from './booking-steps/PaymentStep'
import { ConfirmationStep } from './booking-steps/ConfirmationStep'
import { BookingFormData, BusinessHoursData, ServiceTimeWindowData } from '@/types/booking'
import { ServiceWithUpsells, ServicePricingOption } from '@/types/service'
import { calculateAfterHoursSurcharge } from '@/lib/timeSlots'

const STEPS = [
  { id: 'service', label: 'Service Details' },
  { id: 'personalisation', label: 'Personalisation' },
  { id: 'datetime', label: 'Date & Time' },
  { id: 'client', label: 'Client Details' },
  { id: 'payment', label: 'Payment' },
  { id: 'confirmation', label: 'Confirmation' },
]

function getPriceForPeopleCount(service: ServiceWithUpsells, count: number): number | null {
  switch (count) {
    case 1:
      return service.price_1_person
    case 2:
      return service.price_2_people
    case 3:
      return service.price_3_people
    case 4:
      return service.price_4_people
    case 5:
      return service.price_5_people
    case 6:
      return service.price_6_people
    default:
      return null
  }
}

function getPricingOptionPrice(option: ServicePricingOption, peopleCount: number): number {
  switch (peopleCount) {
    case 1:
      return option.price1
    case 2:
      return option.price2 > 0 ? option.price2 : option.price1
    case 3:
      return option.price3 > 0 ? option.price3 : option.price1
    default:
      return option.price1
  }
}

function getDisplayPrice(service: ServiceWithUpsells, peopleCount: number, pricingOption: ServicePricingOption | null | undefined): number {
  if (pricingOption) {
    return getPricingOptionPrice(pricingOption, peopleCount)
  }
  return getPriceForPeopleCount(service, peopleCount) ?? service.price_1_person
}

const DEFAULT_BUSINESS_HOURS: BusinessHoursData = {
  open_time: '08:30',
  close_time: '16:30',
  after_hours_enabled: true,
  after_hours_end_time: '20:00',
}

interface BookingModalProps {
  services: ServiceWithUpsells[]
  businessHours?: BusinessHoursData
  serviceTimeWindows?: Record<string, ServiceTimeWindowData>
  publicHolidayDates?: string[]
}

export function BookingModal({
  services,
  businessHours = DEFAULT_BUSINESS_HOURS,
  serviceTimeWindows = {},
  publicHolidayDates = [],
}: BookingModalProps) {
  const { isOpen, selectedService, serviceSlug, closeModal } = useBookingModal()
  const [currentStep, setCurrentStep] = useState(0)
  const [formData, setFormData] = useState<BookingFormData>({
    peopleCount: 1,
    selectedUpsells: [],
    selectedUpsellsByPerson: { 1: [] },
    pressureByPerson: {},
    selectedDate: '',
    selectedTime: '',
    clientName: '',
    clientEmail: '',
    clientPhone: '',
    clientDateOfBirth: '',
    clientAllergies: '',
    clientMassagePressure: '',
    clientMedicalHistory: '',
    clientIsPregnant: null,
    clientPregnancyWeeks: null,
    afterHoursSurcharge: 0,
    selectedPricingOption: null,
    roomSharingNoticeAccepted: false,
  })
  const [resolvedService, setResolvedService] = useState<ServiceWithUpsells | null>(null)

  const getDefaultPricingOption = (service: ServiceWithUpsells): ServicePricingOption | null => {
    if (!service.pricingOptions || service.pricingOptions.length === 0) return null
    return service.pricingOptions.find(opt => opt.is_default) || service.pricingOptions[0]
  }

  useEffect(() => {
    let newService: ServiceWithUpsells | null = null
    if (selectedService) {
      newService = selectedService
    } else if (serviceSlug) {
      newService = services.find((s) => s.slug === serviceSlug) || null
    }
    setResolvedService(newService)

    if (newService) {
      const defaultOption = getDefaultPricingOption(newService)
      if (defaultOption && !formData.selectedPricingOption) {
        setFormData((prev) => ({ ...prev, selectedPricingOption: defaultOption }))
      }
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

  useEffect(() => {
    if (resolvedService && formData.selectedTime) {
      const surcharge = calculateAfterHoursSurcharge(
        formData.selectedTime,
        resolvedService.slug,
        formData.peopleCount,
        businessHours
      )
      if (surcharge !== formData.afterHoursSurcharge) {
        setFormData((prev) => ({ ...prev, afterHoursSurcharge: surcharge }))
      }
    }
  }, [formData.selectedTime, formData.peopleCount, resolvedService, businessHours, formData.afterHoursSurcharge])

  if (!isOpen || !resolvedService) return null

  const serviceTimeWindow = serviceTimeWindows[resolvedService.slug] || null

  // Whether the room surcharge checkbox is shown (mirrors the condition in ServiceDetailsStep)
  const hasPricingOptions = resolvedService.pricingOptions && resolvedService.pricingOptions.length > 0
  const showRoomCheckbox = !hasPricingOptions && resolvedService.max_people > 1

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
      selectedUpsellsByPerson: { 1: [] },
      pressureByPerson: {},
      selectedDate: '',
      selectedTime: '',
      clientName: '',
      clientEmail: '',
      clientPhone: '',
      clientDateOfBirth: '',
      clientAllergies: '',
      clientMassagePressure: '',
      clientMedicalHistory: '',
      clientIsPregnant: null,
      clientPregnancyWeeks: null,
      afterHoursSurcharge: 0,
      selectedPricingOption: null,
      roomSharingNoticeAccepted: false,
    })
    closeModal()
  }

  const updateFormData = (updates: Partial<BookingFormData>) => {
    setFormData((prev) => ({ ...prev, ...updates }))
  }

  const calculateTotalDuration = (): number => {
    if (!resolvedService) return 0

    const upsellMap = new Map(resolvedService.upsells.map((u) => [u.id, u]))
    let maxAddonDuration = 0

    for (let person = 1; person <= formData.peopleCount; person++) {
      const personUpsells = formData.selectedUpsellsByPerson[person] || []
      for (const upsellId of personUpsells) {
        const upsell = upsellMap.get(upsellId)
        if (upsell && upsell.duration_added_minutes > 0) {
          if (upsell.duration_added_minutes > maxAddonDuration) {
            maxAddonDuration = upsell.duration_added_minutes
          }
        }
      }
    }

    return resolvedService.duration_minutes + maxAddonDuration
  }

  const canProceedToNext = () => {
    switch (currentStep) {
      case 0:
        return !showRoomCheckbox || formData.roomSharingNoticeAccepted
      case 1:
        for (let i = 1; i <= formData.peopleCount; i++) {
          if (!formData.pressureByPerson[i]) {
            return false
          }
        }
        return true
      case 3:
        return (
          formData.clientName.trim() !== '' &&
          formData.clientEmail.trim() !== '' &&
          formData.clientPhone.trim() !== '' &&
          formData.clientDateOfBirth.trim() !== '' &&
          formData.clientIsPregnant !== null
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
            selectedPricingOption={formData.selectedPricingOption}
            onUpdatePricingOption={(option) => updateFormData({ selectedPricingOption: option })}
            roomSharingNoticeAccepted={formData.roomSharingNoticeAccepted}
            onUpdateRoomSharingNotice={(accepted) => updateFormData({ roomSharingNoticeAccepted: accepted })}
          />
        )
      case 1:
        return (
          <PersonalisationStep
            availableUpsells={resolvedService.upsells}
            peopleCount={formData.peopleCount}
            selectedUpsellsByPerson={formData.selectedUpsellsByPerson}
            pressureByPerson={formData.pressureByPerson}
            onUpdateUpsellsByPerson={(upsellsByPerson) => {
              const allUpsells = Object.values(upsellsByPerson).flat()
              updateFormData({
                selectedUpsellsByPerson: upsellsByPerson,
                selectedUpsells: [...new Set(allUpsells)],
              })
            }}
            onUpdatePressureByPerson={(pressures) => {
              updateFormData({ pressureByPerson: pressures })
            }}
          />
        )
      case 2:
        return (
          <DateTimeStep
            selectedDate={formData.selectedDate}
            selectedTime={formData.selectedTime}
            onUpdateDate={(date) => updateFormData({ selectedDate: date })}
            onUpdateTime={(time) => updateFormData({ selectedTime: time })}
            serviceSlug={resolvedService.slug}
            serviceDurationMinutes={calculateTotalDuration()}
            peopleCount={formData.peopleCount}
            businessHours={businessHours}
            serviceTimeWindow={serviceTimeWindow}
          />
        )
      case 3:
        return (
          <ClientDetailsStep
            clientName={formData.clientName}
            clientEmail={formData.clientEmail}
            clientPhone={formData.clientPhone}
            clientDateOfBirth={formData.clientDateOfBirth}
            clientAllergies={formData.clientAllergies}
            clientMedicalHistory={formData.clientMedicalHistory}
            clientIsPregnant={formData.clientIsPregnant}
            onUpdateClient={(updates) => updateFormData(updates)}
          />
        )
      case 4:
        return (
          <PaymentStep
            service={resolvedService}
            formData={formData}
            businessHours={businessHours}
            publicHolidayDates={publicHolidayDates}
          />
        )
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
              className="absolute right-4 top-4 z-10 rounded-full p-1 text-gray-500 hover:bg-gray
