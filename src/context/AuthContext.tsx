'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { getUserRole } from '../lib/auth'
import type { Role, UserProfile } from '../types/auth'

interface AuthContextValue {
  user:    User | null
  profile: UserProfile | null
  role:    Role | null
  loading: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user,    setUser]    = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (cancelled) return
        // TOKEN_REFRESHED keeps the same user — skip profile re-fetch
        if (event === 'TOKEN_REFRESHED') return

        setUser(session?.user ?? null)
        try {
          if (session?.user) {
            const p = await getUserRole(session.user.id, session.access_token)
            if (!cancelled) setProfile(p)
          } else {
            setProfile(null)
          }
        } catch (err) {
          console.error('[AuthContext] getUserRole error', err)
          if (!cancelled) setProfile(null)
        } finally {
          if (!cancelled) setLoading(false)
        }
      }
    )

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  return (
    <AuthContext.Provider value={{ user, profile, role: profile?.role ?? null, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuthContext() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuthContext must be used within AuthProvider')
  return ctx
}
