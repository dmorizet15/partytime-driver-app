import type { Metadata, Viewport } from 'next'
import { Archivo, Inter } from 'next/font/google'
import './globals.css'
import { AppStateProvider } from '@/context/AppStateContext'
import { AuthProvider } from '@/context/AuthContext'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
  weight: ['400', '500', '600', '700', '800'],
})

const archivo = Archivo({
  subsets: ['latin'],
  variable: '--font-archivo',
  display: 'swap',
  weight: ['400', '500', '600', '700', '800', '900'],
})

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
    <html lang="en" className={`${inter.variable} ${archivo.variable}`}>
      <body
        className="min-h-screen"
        style={{
          background: '#FFF9EE',
          fontFamily: 'var(--font-inter), Inter, system-ui, -apple-system, sans-serif',
        }}
      >
        <AuthProvider>
          <AppStateProvider>
            {/*
              Max-width wrapper centres the app on desktop while
              keeping it full-bleed on mobile.
              On Android WebView the max-w constraint has no effect.
            */}
            <div
              className="max-w-md mx-auto min-h-screen"
              style={{ background: '#FFF9EE' }}
            >
              {children}
            </div>
          </AppStateProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
