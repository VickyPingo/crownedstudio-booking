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
  publicHolidayDates: string[]
}

export function BookingPageClient({
  services,
  serviceSlug,
  serviceName,
  businessHours,
  serviceTimeWindows,
  publicHolidayDates,
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

      <p style={{ marginBottom: "16px", color: "#666" }}>
        Complete your booking details below.
      </p>

      {/* Gift voucher CTA */}
      <div style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "8px",
        marginBottom: "30px",
        padding: "10px 16px",
        background: "#f9f9f9",
        border: "1px solid #e5e5e5",
        borderRadius: "8px",
        fontSize: "14px",
        color: "#555",
      }}>
        <span>🎁</span>
        <span>Want to give this as a gift?</span>
        <a
          href={`/gift-voucher/${serviceSlug}`}
          style={{
            color: "#111",
            fontWeight: 600,
            textDecoration: "underline",
          }}
        >
          Buy a Gift Voucher →
        </a>
      </div>

      <BookingModal
        services={services}
        businessHours={businessHours}
        serviceTimeWindows={serviceTimeWindows}
        publicHolidayDates={publicHolidayDates}
      />
    </main>
  )
}
