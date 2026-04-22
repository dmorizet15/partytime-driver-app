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
      console.error('[upload-photo] Missing SUPABASE_URL or SUPABASE_SERVICE_KEY')
      return NextResponse.json({ success: false, error: 'Server misconfiguration' }, { status: 500 })
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    const bytes  = await (file as File).arrayBuffer()
    const buffer = Buffer.from(bytes)

    const storagePath = `${stopId}/${Date.now()}.jpg`

    const { error: uploadError } = await supabase.storage
      .from('pod-photos')
      .upload(storagePath, buffer, { contentType: 'image/jpeg', upsert: true })

    if (uploadError) {
      console.error('[upload-photo] Storage upload error:', uploadError.message)
      return NextResponse.json({ success: false, error: uploadError.message }, { status: 500 })
    }

    const { data: urlData } = supabase.storage
      .from('pod-photos')
      .getPublicUrl(storagePath)

    const publicUrl = urlData.publicUrl

    const { error: dbError } = await supabase
      .from('stops')
      .upsert({ stop_id: stopId, pod_photo_url: publicUrl }, { onConflict: 'stop_id' })

    if (dbError) {
      console.error('[upload-photo] DB upsert error:', dbError.message)
      return NextResponse.json({ success: false, error: dbError.message }, { status: 500 })
    }

    console.log(`[upload-photo] Uploaded for stop ${stopId} (route: ${routeId ?? 'unknown'}): ${publicUrl}`)
    return NextResponse.json({ success: true, url: publicUrl })

  } catch (err) {
    console.error('[upload-photo] Error:', err)
    return NextResponse.json({ success: false, error: 'Upload failed — server error' }, { status: 500 })
  }
}
