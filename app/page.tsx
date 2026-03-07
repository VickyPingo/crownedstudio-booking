import { supabaseAdmin } from "@/lib/supabase/server"
import { ServiceList } from "@/components/ServiceList"

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

      <ServiceList services={services || []} />
    </main>
  )
}