# PartyTime Driver App

Mobile-first driver route management web app for **PartyTime Rentals** delivery crews.
Drivers use it on Android devices to work through daily delivery routes: see stops, send
"on the way" texts, navigate, scan RFID tags, capture proof-of-delivery photos, and mark
stops complete.

---

## Current Status — V1.1 Prototype

| Area | Status |
|---|---|
| Core screens (Route selection → Stop list → Stop detail) | ✅ Working |
| Stop status state (pending / OTW sent / completed) | ✅ Working |
| "Send On The Way" text | ✅ Stubbed (700 ms delay, always succeeds) |
| Navigation launch (geo: URI → CoPilot) | ✅ Stubbed (console.log) |
| TapGoods order launch (opens pick list in browser) | ✅ Working — real URL |
| Easy RFID Pro App launch (Android intent://) | ✅ Working on Android / graceful no-op in browser |
| Proof of Delivery photo capture + upload | ✅ Working — saves to `public/uploads/` |
| Workflow event logging | ✅ Stubbed (console.log) |
| Backend / database | ❌ Not implemented — all data is in-memory mock |
| SMS sending (Twilio) | ❌ Stubbed — no real SMS sent |
| Authentication / login | ❌ Not implemented |

---

## What is mocked vs real

### Real (works today)
- All UI, routing, and client-side state management
- TapGoods pick list URL (`https://business.tapgoods.com/orders/rentals/{id}/pickList`)
- Easy RFID Pro intent launch on Android (`com.pts.publisher.EasyRFIDProV7`)
- Photo capture (`<input capture="environment">`) and upload to `public/uploads/`
- Workflow event types and logging structure

### Stubbed / mocked
- **Route & stop data** — `src/data/mockData.ts`. Four routes hardcoded for 2026-04-19/20.
  Replace with a real API call in Phase 2.
- **SMS notifications** — `src/services/NotificationService.ts` waits 700 ms and returns
  `{ success: true }`. Phase 2: POST to a backend endpoint → Twilio.
- **Navigation** — `src/services/NavigationService.ts` logs the `geo:` URI to console.
  Phase 2: `window.location.href = uri` in the Android WebView wrapper intercepts and
  hands off to CoPilot (`com.alk.copilot.mapviewer`).
- **Event logging** — `src/services/EventLogger.ts` writes to the browser console.
  Phase 2: POST to `/api/events`.
- **Photo storage** — photos land in `public/uploads/` (local disk). Phase 2: swap
  `src/app/api/upload-photo/route.ts` to upload to S3 / R2; response shape stays identical.

---

## Running locally

```bash
# 1. Install dependencies
npm install

# 2. Start the dev server
npm run dev

# 3. Open in a mobile-sized window
#    Chrome DevTools → device emulation at 390×844 (iPhone 14 Pro)
#    Or open on an Android device at http://<your-local-ip>:3000
```

No environment variables are needed for V1 (all data is mocked).

---

## Screens

| URL | Screen |
|---|---|
| `/` | Date & Route Selection |
| `/route/[routeId]` | Stop List |
| `/route/[routeId]/stop/[stopId]` | Stop Detail & actions |

---

## Project structure

```
src/
  app/                  # Next.js 14 App Router pages + API routes
    api/upload-photo/   # POST endpoint — saves POD photos to public/uploads/
  components/           # Shared UI (StopStatusBadge, ConfirmationModal, etc.)
  config/               # External app constants (TapGoods URL, RFID package name)
  context/              # AppStateContext — global stop state (React Context + useReducer)
  data/                 # mockData.ts — routes and stops
  screens/              # Full-screen components (one per route)
  services/             # Integrations behind interfaces (Navigation, Notification, EventLogger,
  │                     #   ExternalApp, PhotoUpload) — swap implementations for Phase 2
  types/                # TypeScript types (Stop, Route, WorkflowEvent, etc.)
```

---

## Phase 2 upgrade path

Each service is behind a TypeScript interface. Replacing the stub with a real
implementation is a one-file change per service; no screen component needs to change.

| Service file | V1 stub | Phase 2 target |
|---|---|---|
| `NavigationService.ts` | `console.log` geo URI | Android WebView → CoPilot |
| `NotificationService.ts` | 700 ms delay | POST → Twilio SMS |
| `EventLogger.ts` | `console.log` | POST → `/api/events` |
| `PhotoUploadService.ts` + API route | Local disk | S3 / Cloudflare R2 |
| `mockData.ts` | Static array | GET `/api/routes?date=` |

---

## Tech stack

- **Next.js 14** (App Router)
- **React 18** with `useReducer` + Context for state
- **TypeScript** (strict)
- **Tailwind CSS 3.4** — mobile-first, `100dvh`, no external component libraries
