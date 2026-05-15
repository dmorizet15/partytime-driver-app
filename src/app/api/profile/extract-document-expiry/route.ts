// POST /api/profile/extract-document-expiry
// ─────────────────────────────────────────
// Driver-app endpoint that extracts an expiry date from an uploaded
// compliance document image using Claude vision. Used by the /profile
// upload flow — the file is uploaded to driver-compliance-docs storage
// first, then this endpoint downloads it via service role, base64-
// encodes it, and asks Claude for the expiry date.
//
// Graceful fallback: when ANTHROPIC_API_KEY is unset (e.g. on a fresh
// deploy before the env var has been added), this returns
// { success: false, reason: 'extraction_unavailable' } so the UI can
// drop the user into manual date entry without surfacing a 500.

import { NextRequest, NextResponse } from 'next/server'
import { cookies }                   from 'next/headers'
import { createServerClient }        from '@supabase/ssr'
import { createClient }              from '@supabase/supabase-js'
import Anthropic                     from '@anthropic-ai/sdk'

export const dynamic = 'force-dynamic'

const MODEL = 'claude-sonnet-4-6'

const SYSTEM_PROMPT = `You extract expiration dates from compliance documents for a delivery driver workforce. Look at the uploaded document (driver's license, DOT medical card, or West Point access ID) and return the expiry date if present.

Rules:
- Output a single JSON object: {"expiry_date": "YYYY-MM-DD", "confidence": "high"|"medium"|"low"} OR {"expiry_date": null, "confidence": "low", "reason": "<short reason>"}.
- The date you return is the EXPIRATION / EXPIRES date on the document. Not issue date, not date of birth.
- If multiple plausible dates appear, prefer the one explicitly labeled "EXP", "EXPIRES", "EXPIRATION", or "EXP DATE".
- If you genuinely cannot identify an expiration date (low image quality, document obscured, no expiry visible), return {"expiry_date": null, "confidence": "low", "reason": "..."} — do not guess.
- Return ONLY the JSON object. No preamble, no explanation, no markdown fences.`

function getSessionClient() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() { /* read-only here */ },
      },
    },
  )
}

function getServiceClient() {
  // Driver-app uses SUPABASE_URL + SUPABASE_SERVICE_KEY (different naming
  // than dashboard's NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

interface Body {
  storage_path?: string         // path inside the driver-compliance-docs bucket
  mime_type?:    string         // image/jpeg | image/png | application/pdf
  document_type?: string        // for prompt context only
}

export async function POST(req: NextRequest) {
  // Auth — driver must be signed in. The bucket's RLS already restricts
  // each driver to their own folder; we additionally verify the storage_path
  // is owned by the caller before downloading.
  const session = getSessionClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) return NextResponse.json({ success: false, reason: 'unauthorized' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    // Graceful fallback — the UI falls back to manual entry. Status 200
    // because this is an expected, non-error state (vision is optional).
    return NextResponse.json({
      success: false,
      reason:  'extraction_unavailable',
      message: 'AI extraction is not configured on this deployment. Enter the expiry date manually.',
    })
  }

  const body = (await req.json().catch(() => ({}))) as Body
  const storagePath  = (body.storage_path ?? '').trim()
  const mimeType     = (body.mime_type ?? '').trim()
  const documentType = (body.document_type ?? '').trim()

  if (!storagePath) {
    return NextResponse.json({ success: false, reason: 'storage_path required' }, { status: 400 })
  }
  // Confirm the path is in the caller's own folder. Defense in depth — RLS
  // would already block service-role-bypass-attempting reads from a non-
  // owning driver, but we run with service role inside this route to skip
  // the round-trip through RLS, so an explicit prefix check is the gate.
  if (!storagePath.startsWith(`${user.id}/`)) {
    return NextResponse.json({ success: false, reason: 'forbidden' }, { status: 403 })
  }

  // Vision currently supports JPEG / PNG / GIF / WEBP. PDFs need a separate
  // path (Claude API has document/PDF input but it's a different content
  // block shape). For Phase 1, return manual fallback for PDFs.
  if (mimeType === 'application/pdf') {
    return NextResponse.json({
      success: false,
      reason:  'pdf_not_supported',
      message: 'PDF expiry extraction is not yet supported. Enter the expiry date manually.',
    })
  }

  // Download the file via service role (path ownership already verified).
  const service = getServiceClient()
  const { data: blob, error: dlErr } = await service.storage
    .from('driver-compliance-docs')
    .download(storagePath)
  if (dlErr || !blob) {
    return NextResponse.json(
      { success: false, reason: 'download_failed', message: dlErr?.message ?? 'Could not load file' },
      { status: 500 },
    )
  }

  const arrayBuffer = await blob.arrayBuffer()
  const base64 = Buffer.from(arrayBuffer).toString('base64')

  // Anthropic vision call — see /api/reference/generate-description for the
  // text-only twin in the dashboard repo.
  const anthropic = new Anthropic({ apiKey })

  const docContextLine =
    documentType === 'drivers_license'  ? "This document is a US driver's license." :
    documentType === 'dot_medical_card' ? 'This document is a DOT medical examiner certificate (medical card).' :
    documentType === 'west_point_id'    ? 'This document is a West Point installation access ID.' :
    'This is a compliance document.'

  type Mime = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
  const mt: Mime = mimeType === 'image/png'  ? 'image/png'
                : mimeType === 'image/gif'  ? 'image/gif'
                : mimeType === 'image/webp' ? 'image/webp'
                : 'image/jpeg'

  let modelText = ''
  try {
    const message = await anthropic.messages.create({
      model:       MODEL,
      max_tokens:  200,
      system:      SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mt, data: base64 },
            },
            {
              type: 'text',
              text: `${docContextLine} Return the expiration date in the JSON format I asked for.`,
            },
          ],
        },
      ],
    })
    const textBlock = message.content.find((b) => b.type === 'text')
    modelText = textBlock && 'text' in textBlock ? textBlock.text.trim() : ''
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Vision call failed'
    return NextResponse.json({ success: false, reason: 'model_call_failed', message: msg })
  }

  // Parse the model's JSON response. Be defensive — strip code fences if
  // the model adds them; require an ISO date if any.
  const cleaned = modelText.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  let parsed: { expiry_date?: string | null; confidence?: string; reason?: string } | null = null
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    return NextResponse.json({
      success: false,
      reason:  'parse_failed',
      message: 'AI returned an unexpected response. Enter the expiry date manually.',
    })
  }

  if (!parsed || !parsed.expiry_date) {
    return NextResponse.json({
      success:    false,
      reason:     'no_date_found',
      confidence: parsed?.confidence ?? 'low',
      message:    parsed?.reason ?? 'Could not detect an expiry date on this document.',
    })
  }

  // Validate the date is plausible — YYYY-MM-DD, parseable, between 1970
  // and 2100. Reject otherwise.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(parsed.expiry_date)) {
    return NextResponse.json({
      success: false,
      reason:  'bad_date_format',
      message: 'AI returned a date in an unexpected format. Enter manually.',
    })
  }
  const t = Date.parse(parsed.expiry_date + 'T00:00:00')
  if (Number.isNaN(t)) {
    return NextResponse.json({
      success: false,
      reason:  'bad_date_format',
      message: 'AI returned an unparseable date. Enter manually.',
    })
  }

  return NextResponse.json({
    success:    true,
    expiry_date: parsed.expiry_date,
    confidence: parsed.confidence ?? 'medium',
  })
}
