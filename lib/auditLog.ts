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

async function resolveCurrentAdminIdentity(): Promise<{
  adminId: string | null
  adminName: string | null
}> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    console.error('[auditLog] Failed to get current user:', userError)
    return { adminId: null, adminName: null }
  }

  const { data: adminRow, error: adminError } = await supabase
    .from('admin_users')
    .select('id, name, email, is_active')
    .eq('id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (adminError) {
    console.error('[auditLog] Failed to resolve admin row:', adminError)
  }

  const adminName =
    adminRow?.name ||
    adminRow?.email ||
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email ||
    null

  return {
    adminId: user.id,
    adminName,
  }
}

export async function writeAuditLog(
  bookingId: string,
  actionType: AuditActionType,
  details: AuditDetails
): Promise<void> {
  try {
    const { adminId, adminName } = await resolveCurrentAdminIdentity()

    const { error } = await supabase.from('booking_audit_log').insert({
      booking_id: bookingId,
      action_type: actionType,
      changed_by_admin_id: adminId,
      changed_by_name: adminName,
      details_json: details,
    })

    if (error) {
      console.error('[auditLog] Failed to insert audit row:', error)
    }
  } catch (err) {
    console.error('[auditLog] Unexpected error:', err)
  }
}
