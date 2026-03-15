import { supabaseAdmin } from "@/lib/supabase/server"
import { ServiceWithUpsells, ServicePricingOption } from "@/types/service"
import { BusinessHoursData, ServiceTimeWindowData } from "@/types/booking"
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

  const { data: pricingOptionsData } = await supabaseAdmin
    .from("service_pricing_options")
    .select("*")
    .eq("active", true)
    .order("is_default", { ascending: false })

  const pricingOptionsBySlug: Record<string, ServicePricingOption[]> = {}
  if (pricingOptionsData) {
    for (const option of pricingOptionsData) {
      if (!pricingOptionsBySlug[option.service_slug]) {
        pricingOptionsBySlug[option.service_slug] = []
      }
      pricingOptionsBySlug[option.service_slug].push({
        ...option,
        price1: parseFloat(option.price1),
        price2: parseFloat(option.price2),
        price3: parseFloat(option.price3),
      })
    }
  }

  const { data: businessHoursRow } = await supabaseAdmin
    .from("business_hours")
    .select("open_time, close_time, after_hours_enabled, after_hours_end_time")
    .eq("day_of_week", 1)
    .maybeSingle()

  const businessHours: BusinessHoursData = businessHoursRow || {
    open_time: "08:30",
    close_time: "16:30",
    after_hours_enabled: true,
    after_hours_end_time: "20:00",
  }

  const { data: serviceTimeWindows } = await supabaseAdmin
    .from("service_time_windows")
    .select("service_slug, start_time, end_time")

  const timeWindowsMap: Record<string, ServiceTimeWindowData> = {}
  if (serviceTimeWindows) {
    for (const window of serviceTimeWindows) {
      timeWindowsMap[window.service_slug] = window
    }
  }

  const servicesWithUpsells: ServiceWithUpsells[] = (services || []).map((service) => {
    const allowedUpsellNames = service.allowed_upsells
      ? service.allowed_upsells.split(/[,\n]/).map((s: string) => s.trim()).filter((s: string) => s.length > 0)
      : []

    const serviceUpsells = (allUpsells || []).filter((upsell) =>
      allowedUpsellNames.includes(upsell.name)
    )

    return {
      ...service,
      upsells: serviceUpsells,
      pricingOptions: pricingOptionsBySlug[service.slug] || undefined,
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
      businessHours={businessHours}
      serviceTimeWindows={timeWindowsMap}
    />
  )
}
