import { supabase } from '@/lib/supabase/client'

export async function checkAdminAccess(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('admin_users')
    .select('id, is_active')
    .eq('id', userId)
    .eq('is_active', true)
    .maybeSingle()

  if (error || !data) {
    return false
  }

  return true
}

export async function getAdminUser(userId: string) {
  const { data, error } = await supabase
    .from('admin_users')
    .select('*')
    .eq('id', userId)
    .eq('is_active', true)
    .maybeSingle()

  if (error) {
    return null
  }

  return data
}

export async function signInAdmin(email: string, password: string) {
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (authError) {
    return { error: authError.message, user: null }
  }

  if (!authData.user) {
    return { error: 'Authentication failed', user: null }
  }

  const isAdmin = await checkAdminAccess(authData.user.id)

  if (!isAdmin) {
    await supabase.auth.signOut()
    return { error: 'Access denied. You are not an approved administrator.', user: null }
  }

  return { error: null, user: authData.user }
}

export async function signOutAdmin() {
  const { error } = await supabase.auth.signOut()
  return { error: error?.message || null }
}
