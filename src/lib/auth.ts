import { supabase } from './supabase'
import type { UserProfile } from '../types/auth'

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

export async function getUserRole(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, role, display_name')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    console.error('[getUserRole] Supabase error:', error.message, '| code:', error.code, '| userId:', userId)
    return null
  }
  if (!data) {
    console.error('[getUserRole] No profile row found for userId:', userId)
    return null
  }
  return data as UserProfile
}

export async function signIn(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password })
}

export async function signOut() {
  return supabase.auth.signOut()
}
