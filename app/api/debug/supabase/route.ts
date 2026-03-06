import { supabaseAdmin } from "@/lib/supabase/server"

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("services")
    .select("slug")
    .limit(10)

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ services: data })
}