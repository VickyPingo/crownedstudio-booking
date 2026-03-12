import { supabaseAdmin } from "@/lib/supabase/server"
import { ServiceList } from "@/components/ServiceList"
import { Service, ServiceWithUpsells, Upsell } from "@/types/service"

export default async function Home() {
  const { data: services, error } = await supabaseAdmin
    .from("services")
    .select(`
      id,
      name,
      slug,
      description,
      price_1_person,
      price_2_people,
      price_3_people,
      price_4_people,
      price_5_people,
      price_6_people,
      max_people,
      duration_minutes,
      allowed_upsells
    `)
    .eq("active", true)
    .order("name", { ascending: true })

  const { data: allUpsells } = await supabaseAdmin
    .from("upsells")
    .select("id, slug, name, price, quantity_rule, duration_added_minutes")
    .eq("active", true)

  const servicesWithUpsells: ServiceWithUpsells[] = (services || []).map((service: Service) => {
    const allowedUpsellNames = service.allowed_upsells
      ? service.allowed_upsells.split(/[,\n]/).map(s => s.trim()).filter(s => s.length > 0)
      : []

    const serviceUpsells = (allUpsells || []).filter((upsell: Upsell) =>
      allowedUpsellNames.includes(upsell.name)
    )

    return {
      ...service,
      upsells: serviceUpsells
    }
  })

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

      <ServiceList services={servicesWithUpsells} />
    </main>
  )
}