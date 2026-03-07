'use client'

import { useBookingModal } from '@/hooks/useBookingModal'
import { BookingModal } from './BookingModal'

interface Service {
  id: string
  name: string
  slug: string
  description: string
}

export function ServiceList({ services }: { services: Service[] }) {
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

            <button
              onClick={() => openModal(service)}
              style={{
                display: "inline-block",
                padding: "12px 18px",
                background: "#000",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
              }}
            >
              Book Now
            </button>
          </div>
        ))}
      </div>

      <BookingModal />
    </>
  )
}
