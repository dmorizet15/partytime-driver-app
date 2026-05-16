import type { Metadata } from 'next'
import { Outfit } from 'next/font/google'

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit',
  display: 'swap',
  weight: ['400', '500', '600', '700', '800', '900'],
})

export const metadata: Metadata = {
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'black-translucent',
  },
}

export default function ArcadeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={outfit.variable}
      style={{
        fontFamily: 'var(--font-outfit), system-ui, -apple-system, sans-serif',
      }}
    >
      {children}
    </div>
  )
}
