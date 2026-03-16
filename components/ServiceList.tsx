'use client'

import { useBookingModal } from '@/hooks/useBookingModal'
import { BookingModal } from './BookingModal'
import { ServiceWithUpsells } from '@/types/service'
import { BusinessHoursData, ServiceTimeWindowData } from '@/types/booking'

interface ServiceListProps {
  services: ServiceWithUpsells[]
  businessHours: BusinessHoursData
  serviceTimeWindows: Record<string, ServiceTimeWindowData>
  publicHolidayDates: string[]
}

export function ServiceList({ services, businessHours, serviceTimeWindows, publicHolidayDates }: ServiceListProps) {
  const { openModal } = useBookingModal()

  return (
    <>
      <div style={{ display: "grid", gap: "20px" }}>
        {services.map((service) => (
          <div
            key={service.id}
            style={{
              border: "1px solid #ddd",
              borderRadius: "10px",
              padding: "20px",
              background: "#fff",
              color: "#000",
            }}
          >
            <h2 style={{ margin: "0 0 8px 0", fontSize: "24px" }}>
              {service.name}
            </h2>

            <p style={{ margin: "0 0 10px 0", color: "#666", fontSize: "14px" }}>
              {service.slug}
            </p>

            <p style={{ margin: "0 0 16px 0" }}>
              {service.description || "No description yet."}
            </p>

            <a
              href={`https://book.crownedstudio.co.za/booking/${service.slug}`}
              style={{
                display: "inline-block",
                padding: "12px 18px",
                background: "#000",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                textDecoration: "none",
              }}
            >
              Book Now
            </a>
          </div>
        ))}
      </div>

      <BookingModal
        services={services}
        businessHours={businessHours}
        serviceTimeWindows={serviceTimeWindows}
        publicHolidayDates={publicHolidayDates}
      />
    </>
  )
}
