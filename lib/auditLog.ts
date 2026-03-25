import { supabase } from '@/lib/supabase/client'
import { getAdminUser } from '@/lib/admin/auth'

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

export async function writeAuditLog(
  bookingId: string,
  actionType: AuditActionType,
  details: AuditDetails
): Promise<void> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return

    const adminUser = await getAdminUser(user.id)

    await supabase.from('booking_audit_log').insert({
      booking_id: bookingId,
      action_type: actionType,
      changed_by_admin_id: user.id,
      changed_by_name: adminUser?.name || adminUser?.email || user.email || null,
      details_json: details,
    })
  } catch {
    // Do nothing — logging must never break booking flow
  }
}
