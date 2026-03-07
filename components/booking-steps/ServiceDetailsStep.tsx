'use client'

import { ServiceWithUpsells } from '@/types/service'

interface ServiceDetailsStepProps {
  service: ServiceWithUpsells
}

export function ServiceDetailsStep({ service }: ServiceDetailsStepProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-xl font-semibold">Service Details</h3>

      <div className="border rounded-lg p-4 bg-gray-50">
        <p className="text-sm text-gray-500 mb-1">Service Name</p>
        <p className="text-lg font-semibold">{service.name}</p>
      </div>

      <div className="border rounded-lg p-4 bg-gray-50">
        <p className="text-sm text-gray-500 mb-1">Price (1 person)</p>
        <p className="text-lg font-semibold">R{service.price_1_person}</p>
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
