import { supabaseAdmin } from "@/lib/supabase/server"
import { ServiceWithUpsells } from "@/types/service"
import { BookingPageClient } from "./BookingPageClient"

export default async function BookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

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

  const servicesWithUpsells: ServiceWithUpsells[] = (services || []).map((service) => {
    const allowedUpsellNames = service.allowed_upsells
      ? service.allowed_upsells.split(/[,\n]/).map((s: string) => s.trim()).filter((s: string) => s.length > 0)
      : []

    const serviceUpsells = (allUpsells || []).filter((upsell) =>
      allowedUpsellNames.includes(upsell.name)
    )

    return {
      ...service,
      upsells: serviceUpsells
    } as ServiceWithUpsells
  })

  const requestedService = servicesWithUpsells.find(s => s.slug === slug)

  if (error) {
    return (
      <main style={{ padding: "40px", fontFamily: "Arial", textAlign: "center" }}>
        <h1 style={{ fontSize: "32px", marginBottom: "10px", color: "red" }}>
          Error
        </h1>
        <p>Error loading services: {error.message}</p>
      </main>
    )
  }

  if (!requestedService) {
    return (
      <main style={{ padding: "40px", fontFamily: "Arial", textAlign: "center" }}>
        <h1 style={{ fontSize: "32px", marginBottom: "10px" }}>
          Service Not Found
        </h1>
        <p style={{ marginBottom: "30px", color: "#666" }}>
          The service "{slug}" could not be found.
        </p>
        <a
          href="/"
          style={{
            display: "inline-block",
            padding: "12px 24px",
            background: "#000",
            color: "#fff",
            textDecoration: "none",
            borderRadius: "6px",
          }}
        >
          View All Services
        </a>
      </main>
    )
  }

  return (
    <BookingPageClient
      services={servicesWithUpsells}
      serviceSlug={slug}
      serviceName={requestedService.name}
    />
  )
}
