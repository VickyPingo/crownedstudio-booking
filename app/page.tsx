import Link from "next/link"
import { supabaseAdmin } from "@/lib/supabase/server"

export default async function Home() {
  const { data: services, error } = await supabaseAdmin
    .from("services")
    .select("id, name, slug, description")
    .order("name", { ascending: true })

  return (
    <main style={{ padding: "40px", fontFamily: "Arial" }}>
      <h1 style={{ fontSize: "32px", marginBottom: "10px" }}>
        Crowned Studio Services
      </h1>

      <p style={{ marginBottom: "30px", color: "#666" }}>
        Choose a service to begin your booking.
      </p>

      {error && (
        <p style={{ color: "red", marginBottom: "20px" }}>
          Error loading services: {error.message}
        </p>
      )}

      <div style={{ display: "grid", gap: "20px" }}>
        {services?.map((service) => (
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

            <Link
              href={`/book/${service.slug}`}
              style={{
                display: "inline-block",
                padding: "12px 18px",
                background: "#000",
                color: "#fff",
                textDecoration: "none",
                borderRadius: "6px",
              }}
            >
              Book Now
            </Link>
          </div>
        ))}
      </div>
    </main>
  )
}