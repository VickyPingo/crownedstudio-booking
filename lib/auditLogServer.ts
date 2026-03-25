import { supabaseAdmin } from '@/lib/supabase/admin'

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

export async function writeAuditLogServer(
  bookingId: string,
  actionType: AuditActionType,
  details: AuditDetails,
  changedBy?: {
    adminId?: string | null
    adminName?: string | null
  }
): Promise<void> {
  try {
    await supabaseAdmin.from('booking_audit_log').insert({
      booking_id: bookingId,
      action_type: actionType,
      changed_by_admin_id: changedBy?.adminId || null,
      changed_by_name: changedBy?.adminName || null,
      details_json: details,
    })
  } catch {
    // Do nothing — logging must never break booking flow
  }
}
