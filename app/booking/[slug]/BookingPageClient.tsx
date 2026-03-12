'use client'

import { useEffect } from 'react'
import { useBookingModal } from '@/hooks/useBookingModal'
import { BookingModal } from '@/components/BookingModal'
import { ServiceWithUpsells } from '@/types/service'
import { BusinessHoursData, ServiceTimeWindowData } from '@/types/booking'

interface BookingPageClientProps {
  services: ServiceWithUpsells[]
  serviceSlug: string
  serviceName: string
  businessHours: BusinessHoursData
  serviceTimeWindows: Record<string, ServiceTimeWindowData>
}

export function BookingPageClient({
  services,
  serviceSlug,
  serviceName,
  businessHours,
  serviceTimeWindows,
}: BookingPageClientProps) {
  const { openModalBySlug } = useBookingModal()

  useEffect(() => {
    openModalBySlug(serviceSlug)
  }, [serviceSlug, openModalBySlug])

  return (
    <main style={{ padding: "40px", fontFamily: "Arial" }}>
      <h1 style={{ fontSize: "32px", marginBottom: "10px" }}>
        Book {serviceName}
      </h1>

      <p style={{ marginBottom: "30px", color: "#666" }}>
        Complete your booking details below.
      </p>

      <BookingModal
        services={services}
        businessHours={businessHours}
        serviceTimeWindows={serviceTimeWindows}
      />
    </main>
  )
}
