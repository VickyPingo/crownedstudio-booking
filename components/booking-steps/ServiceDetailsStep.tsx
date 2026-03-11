'use client'

import { ServiceWithUpsells } from '@/types/service'

interface ServiceDetailsStepProps {
  service: ServiceWithUpsells
  peopleCount: number
  onUpdatePeopleCount: (count: number) => void
}

function getPriceForPeopleCount(service: ServiceWithUpsells, count: number): number {
  switch (count) {
    case 1:
      return service.price_1_person
    case 2:
      return service.price_2_people
    case 3:
      return service.price_3_people
    default:
      return service.price_1_person
  }
}

export function ServiceDetailsStep({ service, peopleCount, onUpdatePeopleCount }: ServiceDetailsStepProps) {
  const peopleOptions: number[] = []
  for (let i = 1; i <= service.max_people && i <= 3; i++) {
    peopleOptions.push(i)
  }

  const currentPrice = getPriceForPeopleCount(service, peopleCount)

  return (
    <div className="space-y-4">
      <h3 className="text-xl font-semibold">Service Details</h3>

      <div className="border rounded-lg p-4 bg-gray-50">
        <p className="text-sm text-gray-500 mb-1">Service Name</p>
        <p className="text-lg font-semibold">{service.name}</p>
      </div>

      <div className="border rounded-lg p-4 bg-gray-50">
        <p className="text-sm text-gray-500 mb-2">Number of People</p>
        <div className="flex gap-3">
          {peopleOptions.map((count) => {
            const price = getPriceForPeopleCount(service, count)
            const isSelected = peopleCount === count
            return (
              <button
                key={count}
                type="button"
                onClick={() => onUpdatePeopleCount(count)}
                className={`flex-1 p-3 rounded-lg border-2 transition-colors ${
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
      </div>

      <div className="border rounded-lg p-4 bg-gray-50">
        <p className="text-sm text-gray-500 mb-1">Price</p>
        <p className="text-lg font-semibold">R{currentPrice}</p>
      </div>

      <div className="border rounded-lg p-4 bg-gray-50">
        <p className="text-sm text-gray-500 mb-1">Duration</p>
        <p className="text-sm">{service.duration_minutes} minutes</p>
      </div>

      {service.description && (
        <div className="border rounded-lg p-4 bg-gray-50">
          <p className="text-sm text-gray-500 mb-1">Description</p>
          <p className="text-sm">{service.description}</p>
        </div>
      )}
    </div>
  )
}
