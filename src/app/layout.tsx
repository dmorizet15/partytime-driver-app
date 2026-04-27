import type { Metadata, Viewport } from 'next'
import './globals.css'
import { AppStateProvider } from '@/context/AppStateContext'
import { AuthProvider } from '@/context/AuthContext'

export const metadata: Metadata = {
  title: 'PartyTime Driver',
  description: 'PartyTime Rentals driver route management app — V1',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-300 min-h-screen">
        <AuthProvider>
          <AppStateProvider>
            {/*
              Max-width wrapper centres the app on desktop while
              keeping it full-bleed on mobile.
              On Android WebView the max-w constraint has no effect.
            */}
            <div className="max-w-md mx-auto min-h-screen bg-white shadow-xl">
              {children}
            </div>
          </AppStateProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
