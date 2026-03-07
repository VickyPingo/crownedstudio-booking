'use client'

interface Service {
  id: string
  name: string
  slug: string
  description: string
}

interface ServiceDetailsStepProps {
  service: Service
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
        <p className="text-sm text-gray-500 mb-1">Service Slug</p>
        <p className="text-sm font-mono">{service.slug}</p>
      </div>

      <div className="border rounded-lg p-4 bg-gray-50">
        <p className="text-sm text-gray-500 mb-1">Description</p>
        <p className="text-sm">{service.description}</p>
      </div>
    </div>
  )
}
