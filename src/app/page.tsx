'use client'

import { useAuth } from '@/hooks/useAuth'
import DayRouteSelectorScreen from '@/screens/DayRouteSelectorScreen'

export default function HomePage() {
  const { user, role, loading } = useAuth()

  if (loading) return null

  if (!user) return null

  if (role !== 'driver' && role !== 'super_admin') {
    return (
      <div className="min-h-screen flex items-center justify-center"
           style={{ backgroundColor: '#0F1117' }}>
        <p className="text-sm" style={{ color: '#EF4444' }}>Access denied.</p>
      </div>
    )
  }

  return <DayRouteSelectorScreen />
}
