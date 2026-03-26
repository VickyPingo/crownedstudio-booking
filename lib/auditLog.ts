import { supabase } from '@/lib/supabase/client'

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
      error: userError,
    } = await supabase.auth.getUser()

    if (userError) {
      console.error('[auditLog] Failed to get current user:', userError)
      return
    }

    const changedByAdminId = user?.id || null
    const changedByName =
      user?.user_metadata?.full_name ||
      user?.user_metadata?.name ||
      user?.email ||
      'Admin'

    const { error } = await supabase.from('booking_audit_log').insert({
      booking_id: bookingId,
      action_type: actionType,
      changed_by_admin_id: changedByAdminId,
      changed_by_name: changedByName,
      details_json: details,
    })

    if (error) {
      console.error('[auditLog] Failed to insert audit row:', error)
    }
  } catch (err) {
    console.error('[auditLog] Unexpected error:', err)
  }
}
