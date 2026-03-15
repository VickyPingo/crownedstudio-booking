'use client'

import { ServiceWithUpsells, ServicePricingOption } from '@/types/service'

interface ServiceDetailsStepProps {
  service: ServiceWithUpsells
  peopleCount: number
  onUpdatePeopleCount: (count: number) => void
  selectedPricingOption?: ServicePricingOption | null
  onUpdatePricingOption?: (option: ServicePricingOption) => void
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
}: ServiceDetailsStepProps) {
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
                          {option.sessions_included} sessions included - Valid for {option.validity_days} days
                        </p>
                      )}
                    </div>
                    <p className={`text-lg font-semibold ${isSelected ? 'text-white' : 'text-gray-900'}`}>
                      R{optionPrice}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {!hasPricingOptions && peopleOptions.length > 1 && (
        <div className="rounded-lg p-4 bg-white border border-gray-200">
          <p className="text-sm text-gray-800 mb-2">Number of People</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {peopleOptions.map((count) => {
              const price = getPriceForPeopleCount(service, count)
              const isSelected = peopleCount === count
              return (
                <button
                  key={count}
                  type="button"
                  onClick={() => onUpdatePeopleCount(count)}
                  className={`p-3 rounded-lg border-2 transition-colors ${
                    isSelected
                      ? 'border-black bg-black text-white'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <p className={`text-sm font-medium ${isSelected ? 'text-white' : 'text-gray-900'}`}>
                    {count} {count === 1 ? 'Person' : 'People'}
                  </p>
                  <p className={`text-lg font-semibold ${isSelected ? 'text-white' : 'text-gray-900'}`}>
                    R{price}
                  </p>
                </button>
              )
            })}
          </div>

          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-sm text-green-800 mb-2">
              Booking for more than 6 people? Please contact the spa directly on WhatsApp and we'll help you arrange your group booking.
            </p>
            <a
              href="https://wa.me/27698637240?text=Hi%20Crowned%20Studio%2C%20I%20would%20like%20to%20book%20for%20more%20than%206%20people."
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              WhatsApp Us
            </a>
          </div>
        </div>
      )}

      <div className="rounded-lg p-4 bg-white border border-gray-200">
        <p className="text-sm text-gray-800 mb-1">Price</p>
        <p className="text-lg font-semibold text-gray-900">R{currentPrice}</p>
      </div>

      <div className="rounded-lg p-4 bg-white border border-gray-200">
        <p className="text-sm text-gray-800 mb-1">Duration</p>
        <p className="text-sm text-gray-900">{service.duration_minutes} minutes</p>
      </div>

      {service.description && (
        <div className="rounded-lg p-4 bg-white border border-gray-200">
          <p className="text-sm text-gray-800 mb-1">Description</p>
          <p className="text-sm text-gray-700">{service.description}</p>
        </div>
      )}
    </div>
  )
}
