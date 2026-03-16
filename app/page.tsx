import { supabaseAdmin } from "@/lib/supabase/server"
import { ServiceList } from "@/components/ServiceList"
import { Service, ServiceWithUpsells, Upsell } from "@/types/service"
import { BusinessHoursData, ServiceTimeWindowData } from "@/types/booking"

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
      allowed_upsells,
      weekend_surcharge_pp
    `)
    .eq("active", true)
    .order("name", { ascending: true })

  const { data: publicHolidays } = await supabaseAdmin
    .from("public_holidays")
    .select("date")
    .eq("active", true)

  const { data: allUpsells } = await supabaseAdmin
    .from("upsells")
    .select("id, slug, name, price, quantity_rule, duration_added_minutes")
    .eq("active", true)

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

      <ServiceList
        services={servicesWithUpsells}
        businessHours={businessHours}
        serviceTimeWindows={timeWindowsMap}
        publicHolidayDates={(publicHolidays || []).map(h => h.date)}
      />
    </main>
  )
}
