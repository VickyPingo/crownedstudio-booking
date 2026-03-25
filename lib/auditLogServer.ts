import { supabaseAdmin } from '@/lib/supabase/server'

export type AuditActionType =
  | 'booking_created'
  | 'status_changed'
  | 'rescheduled'
  | 'room_changed'
  | 'payment_updated'
  | 'cancelled'
  | 'completed'
  | 'no_show'
  | 'note_added'

interface AuditDetails {
  [key: string]: unknown
}

export async function resolveAdminName(adminId: string | null): Promise<string | null> {
  if (!adminId) return null
  try {
    const { data } = await supabaseAdmin
      .from('admin_users')
      .select('name, email')
      .eq('id', adminId)
      .maybeSingle()
    return data?.name || data?.email || null
  } catch {
    return null
  }
}

export async function writeAuditLogServer(
  bookingId: string,
  actionType: AuditActionType,
  adminId: string | null,
  adminName: string | null,
  details: AuditDetails
): Promise<void> {
  try {
    await supabaseAdmin.from('booking_audit_log').insert({
      booking_id: bookingId,
      action_type: actionType,
      changed_by_admin_id: adminId,
      changed_by_name: adminName,
      details_json: details,
    })
  } catch {
  }
}
