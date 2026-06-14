import { execSync } from 'node:child_process'
import withSerwistInit from '@serwist/next'

// Cache-bust the precached offline page on each commit.
let revision = '1'
try {
  revision = execSync('git rev-parse HEAD').toString().trim()
} catch {
  // not a git checkout — keep the static fallback revision
}

const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  additionalPrecacheEntries: [{ url: '/offline', revision }],
  // No service worker in dev — avoids stale-cache headaches while developing.
  disable: process.env.NODE_ENV === 'development',
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Clean mobile-first config — no extra features for V1
}

export default withSerwist(nextConfig)
