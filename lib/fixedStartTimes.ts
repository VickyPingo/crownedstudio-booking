import { supabaseAdmin } from '@/lib/supabase/server'

/**
 * Fixed online start times per room area, managed in the `booking_start_times`
 * table (Supabase). If an area has no active rows, the public booking flow uses
 * the old flexible 10-minute slots for that area.
 *
 * Fallback: if the table can't be read, treatment rooms use the agreed default
 * times so the booking page never silently reverts to free-form times.
 */
const DEFAULT_FIXED_START_TIMES: Record<string, string[]> = {
  treatment: ['08:30', '10:10', '12:40', '15:00'],
}

/** Services that keep their own scheduling rules (evening slots). */
export const FIXED_TIME_EXEMPT_SLUGS = new Set(['crowned-night-a', 'crowned-night-b'])

export async function getFixedStartTimes(
  roomArea: string,
  supabase: typeof supabaseAdmin = supabaseAdmin
): Promise<string[]> {
  const { data, error } = await supabase
    .from('booking_start_times')
    .select('start_time')
    .eq('room_area', roomArea)
    .eq('active', true)
    .order('start_time', { ascending: true })

  if (error) {
    console.error('[FixedStartTimes] Failed to load start times, using defaults:', error)
    return DEFAULT_FIXED_START_TIMES[roomArea] ?? []
  }

  return (data || []).map((row: { start_time: string }) => String(row.start_time).slice(0, 5))
}
