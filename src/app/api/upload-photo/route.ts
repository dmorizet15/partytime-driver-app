import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

// POST /api/upload-photo
// Accepts: multipart/form-data with fields: file, stop_id, route_id
// Returns: { success: true, url: "/uploads/{filename}" }
//          { success: false, error: "..." }
//
// Phase 2 upgrade: replace writeFile logic with S3 (or GCS, Cloudflare R2) upload.
// The response shape { success, url } stays the same — PhotoUploadService needs no changes.
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

    // ── Ensure uploads directory exists ───────────────────────────────────
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads')
    await mkdir(uploadsDir, { recursive: true })

    // ── Build filename: {stop_id}-{timestamp}.jpg ─────────────────────────
    // Sanitise stop_id to keep filenames filesystem-safe
    const safeStopId = stopId.replace(/[^a-zA-Z0-9_-]/g, '_')
    const timestamp = Date.now()
    const filename = `${safeStopId}-${timestamp}.jpg`
    const filepath = path.join(uploadsDir, filename)

    // ── Write file ────────────────────────────────────────────────────────
    await writeFile(filepath, buffer)

    console.log(`[upload-photo] Saved: ${filename} (route: ${routeId ?? 'unknown'})`)

    return NextResponse.json({ success: true, url: `/uploads/${filename}` })

  } catch (err) {
    console.error('[upload-photo] Error:', err)
    return NextResponse.json(
      { success: false, error: 'Upload failed — server error' },
      { status: 500 }
    )
  }
}
