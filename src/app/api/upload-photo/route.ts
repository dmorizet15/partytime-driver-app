import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// POST /api/upload-photo
// Accepts: multipart/form-data with fields: file, stop_id, route_id
// Returns: { success: true, url: "https://..." } | { success: false, error: "..." }
//
// Uploads compressed JPEG to Supabase Storage bucket `pod-photos`,
// upserts pod_photo_url onto the stops table, and returns the public URL.
// Single-photo per stop — upsert overwrites any previous photo for the same stop_id.
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()

    const file    = formData.get('file')
    const stopId  = formData.get('stop_id')
    const routeId = formData.get('route_id')

    if (!file || typeof file === 'string') {
      return NextResponse.json({ success: false, error: 'Missing file field' }, { status: 400 })
    }
    if (!stopId || typeof stopId !== 'string') {
      return NextResponse.json({ success: false, error: 'Missing stop_id field' }, { status: 400 })
    }

    const supabaseUrl = process.env.SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY
    if (!supabaseUrl || !supabaseKey) {
      console.error('[upload-photo] Missing env vars — SUPABASE_URL present:', !!supabaseUrl, '| SUPABASE_SERVICE_KEY present:', !!supabaseKey)
      return NextResponse.json({ success: false, error: 'Server misconfiguration' }, { status: 500 })
    }

    console.log('[upload-photo] Env vars present. stop_id:', stopId, '| route_id:', routeId ?? 'unknown')

    const supabase = createClient(supabaseUrl, supabaseKey)

    const bytes  = await (file as File).arrayBuffer()
    const buffer = Buffer.from(bytes)

    const storagePath = `${stopId}/${Date.now()}.jpg`

    console.log('[upload-photo] Uploading to storage path:', storagePath)

    const uploadRes = await fetch(
      `${supabaseUrl}/storage/v1/object/pod-photos/${storagePath}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'image/jpeg',
          'x-upsert': 'true',
        },
        body: buffer,
      }
    )

    if (!uploadRes.ok) {
      const errText = await uploadRes.text()
      console.error('[upload-photo] Storage upload error:', uploadRes.status, errText)
      return NextResponse.json({ success: false, error: errText }, { status: 500 })
    }

    console.log('[upload-photo] Storage upload success:', storagePath)

    const publicUrl = `${supabaseUrl}/storage/v1/object/public/pod-photos/${storagePath}`

    console.log('[upload-photo] Public URL generated:', publicUrl)

    const { error: dbError } = await supabase
      .from('stops')
      .update({ pod_photo_url: publicUrl })
      .eq('stop_id', stopId)

    if (dbError) {
      console.error('[upload-photo] DB upsert error:', dbError.message)
      return NextResponse.json({ success: false, error: dbError.message }, { status: 500 })
    }

    console.log('[upload-photo] DB upsert success for stop:', stopId)

    console.log(`[upload-photo] Uploaded for stop ${stopId} (route: ${routeId ?? 'unknown'}): ${publicUrl}`)
    return NextResponse.json({ success: true, url: publicUrl })

  } catch (err) {
    console.error('[upload-photo] Unhandled exception:', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ success: false, error: 'Upload failed — server error' }, { status: 500 })
  }
}
