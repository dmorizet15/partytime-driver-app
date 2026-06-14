// Serwist service worker — minimal, offline-shell only.
//
// Precaching (self.__SW_MANIFEST) is injected by @serwist/next at build time
// and covers the app shell: JS bundles, CSS, and statically-rendered HTML.
// Runtime caching is deliberately limited to page NAVIGATIONS (NetworkFirst,
// with an offline fallback). There is NO rule for /api/* or any Supabase /
// cross-origin endpoint, so those requests always go straight to the network
// and are never cached.
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import { NetworkFirst, Serwist } from 'serwist'

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      // Page navigations only — same-origin, never an API route.
      matcher: ({ request, url, sameOrigin }) =>
        sameOrigin && request.mode === 'navigate' && !url.pathname.startsWith('/api/'),
      handler: new NetworkFirst({
        cacheName: 'pages',
        networkTimeoutSeconds: 10,
      }),
    },
  ],
  fallbacks: {
    entries: [
      {
        url: '/offline',
        matcher: ({ request }) => request.destination === 'document',
      },
    ],
  },
})

serwist.addEventListeners()
