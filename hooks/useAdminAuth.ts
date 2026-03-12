'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { checkAdminAccess, getAdminUser } from '@/lib/admin/auth'
import type { User } from '@supabase/supabase-js'

interface AdminUser {
  id: string
  email: string
  name: string | null
  role: string
  is_active: boolean
  created_at: string
  updated_at: string
}

interface UseAdminAuthReturn {
  user: User | null
  adminUser: AdminUser | null
  loading: boolean
  isAuthenticated: boolean
}

export function useAdminAuth(): UseAdminAuthReturn {
  const [user, setUser] = useState<User | null>(null)
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  const checkAuth = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()

      if (!session?.user) {
        setUser(null)
        setAdminUser(null)
        setLoading(false)
        router.push('/admin/login')
        return
      }

      const isAdmin = await checkAdminAccess(session.user.id)

      if (!isAdmin) {
        await supabase.auth.signOut()
        setUser(null)
        setAdminUser(null)
        setLoading(false)
        router.push('/admin/login')
        return
      }

      const admin = await getAdminUser(session.user.id)
      setUser(session.user)
      setAdminUser(admin)
      setLoading(false)
    } catch {
      setUser(null)
      setAdminUser(null)
      setLoading(false)
      router.push('/admin/login')
    }
  }, [router])

  useEffect(() => {
    checkAuth()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      (async () => {
        if (!session?.user) {
          setUser(null)
          setAdminUser(null)
          router.push('/admin/login')
          return
        }

        const isAdmin = await checkAdminAccess(session.user.id)
        if (!isAdmin) {
          await supabase.auth.signOut()
          setUser(null)
          setAdminUser(null)
          router.push('/admin/login')
          return
        }

        const admin = await getAdminUser(session.user.id)
        setUser(session.user)
        setAdminUser(admin)
      })()
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [checkAuth, router])

  return {
    user,
    adminUser,
    loading,
    isAuthenticated: !!user && !!adminUser,
  }
}
