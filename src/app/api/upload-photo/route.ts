import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

// POST /api/upload-photo
// Accepts: multipart/form-data with fields: file, stop_id, route_id
// Returns: { success: true, url: "..." }   — url is either:
//            /uploads/{filename}           (local dev — static file served by Next.js)
//            data:image/jpeg;base64,...    (Vercel — filesystem is read-only)
//          { success: false, error: "..." }
//
// ROOT CAUSE OF VERCEL FAILURE:
//   Vercel serverless functions run on a read-only filesystem.
//   writeFile to process.cwd()/public/uploads/ throws EROFS and the
//   API returns 500. The fix is to detect the Vercel environment and
//   return a base64 data URL instead of writing to disk.
//
// LOCAL DEV:   writes to public/uploads/ → served as /uploads/{filename}
// VERCEL:      converts to base64 data URL → stored in client state only (not persisted)
//
// PRODUCTION NOTE:
//   Replace the Vercel branch with an upload to S3 / Cloudflare R2 / GCS.
//   Keep the same response shape { success: true, url: "https://..." } —
//   no frontend changes needed.
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()

    const file = formData.get('file')
    const stopId = formData.get('stop_id')
    const routeId = formData.get('route_id')

    // ── Validation ────────────────────────────────────────────────────────
    if (!file || typeof file === 'string') {
      return NextResponse.json(
        { success: false, error: 'Missing file field' },
        { status: 400 }
      )
    }
    if (!stopId || typeof stopId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Missing stop_id field' },
        { status: 400 }
      )
    }

    // ── Read file bytes ───────────────────────────────────────────────────
    const bytes = await (file as File).arrayBuffer()
    const buffer = Buffer.from(bytes)

    // ── Environment split ─────────────────────────────────────────────────
    // process.env.VERCEL is set to "1" by the Vercel runtime.
    const isVercel = process.env.VERCEL === '1'

    if (isVercel) {
      // ── Vercel path: return base64 data URL ──────────────────────────────
      // Filesystem is read-only on Vercel — no disk writes allowed.
      // The data URL is stored in client React state for the session.
      // It is NOT persisted across page reloads (acceptable for V1).
      const base64 = buffer.toString('base64')
      const dataUrl = `data:image/jpeg;base64,${base64}`

      console.log(`[upload-photo] Vercel: returning data URL for stop ${stopId} (route: ${routeId ?? 'unknown'})`)
      return NextResponse.json({ success: true, url: dataUrl })

    } else {
      // ── Local dev path: write to public/uploads/ ─────────────────────────
      const uploadsDir = path.join(process.cwd(), 'public', 'uploads')
      await mkdir(uploadsDir, { recursive: true })

      const safeStopId = stopId.replace(/[^a-zA-Z0-9_-]/g, '_')
      const timestamp = Date.now()
      const filename = `${safeStopId}-${timestamp}.jpg`
      const filepath = path.join(uploadsDir, filename)

      await writeFile(filepath, buffer)

      console.log(`[upload-photo] Local: saved ${filename} (route: ${routeId ?? 'unknown'})`)
      return NextResponse.json({ success: true, url: `/uploads/${filename}` })
    }

  } catch (err) {
    console.error('[upload-photo] Error:', err)
    return NextResponse.json(
      { success: false, error: 'Upload failed — server error' },
      { status: 500 }
    )
  }
}
