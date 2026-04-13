'use client'

import { useState } from 'react'
import { ServiceWithUpsells, ServicePricingOption } from '@/types/service'

interface ServiceDetailsStepProps {
  service: ServiceWithUpsells
  peopleCount: number
  onUpdatePeopleCount: (count: number) => void
  selectedPricingOption?: ServicePricingOption | null
  onUpdatePricingOption?: (option: ServicePricingOption) => void
  onRoomAcknowledgedChange?: (acknowledged: boolean) => void
}

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

export function ServiceDetailsStep({
  service,
  peopleCount,
  onUpdatePeopleCount,
  selectedPricingOption,
  onUpdatePricingOption,
  onRoomAcknowledgedChange,
}: ServiceDetailsStepProps) {
  const [roomAcknowledged, setRoomAcknowledged] = useState(false)

  const hasPricingOptions = service.pricingOptions && service.pricingOptions.length > 0

  const peopleOptions: number[] = []
  if (hasPricingOptions) {
    peopleOptions.push(1)
  } else {
    for (let i = 1; i <= service.max_people && i <= 6; i++) {
      const price = getPriceForPeopleCount(service, i)
      if (price !== null && price > 0) {
        peopleOptions.push(i)
      }
    }
  }

  const currentPrice = hasPricingOptions && selectedPricingOption
    ? getPricingOptionPrice(selectedPricingOption, peopleCount)
    : (getPriceForPeopleCount(service, peopleCount) ?? service.price_1_person)

  const handleRoomAcknowledged = (val: boolean) => {
    setRoomAcknowledged(val)
    onRoomAcknowledgedChange?.(val)
  }

  return (
    <div className="space-y-4">
      <h3 className="text-xl font-semibold text-gray-900">Service Details</h3>

      <div className="rounded-lg p-4 bg-white border border-gray-200">
        <p className="text-sm text-gray-800 mb-1">Service Name</p>
        <p className="text-lg font-semibold text-gray-900">{service.name}</p>
      </div>

      {hasPricingOptions && service.pricingOptions && onUpdatePricingOption && (
        <div className="rounded-lg p-4 bg-white border border-gray-200">
          <p className="text-sm text-gray-800 mb-2">Select Package</p>
          <div className="grid grid-cols-1 gap-3">
            {service.pricingOptions.map((option) => {
              const isSelected = selectedPricingOption?.id === option.id
              const optionPrice = getPricingOptionPrice(option, peopleCount)
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onUpdatePricingOption(option)}
                  className={`p-4 rounded-lg border-2 transition-colors text-left ${
                    isSelected
                      ? 'border-black bg-black text-white'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className={`font-medium ${isSelected ? 'text-white' : 'text-gray-900'}`}>
                        {option.option_name}
                      </p>
                      {option.sessions_included > 1 && (
                        <p className={`text-sm mt-1 ${isSelected ? 'text-gray-200' : 'text-gray-600'}`}>
                          {option.sessions_included} sessions included - Valid
