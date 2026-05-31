// ─── POST /api/sop/sync ──────────────────────────────────────────────────────
// AVA Phase 2 SOP foundation — mirror the Notion SOP Library into sop_entries.
// Session 1 scope: table + this sync endpoint only (no search UI yet).
//
// The SOP Library (Notion page SOP_LIBRARY_PAGE_ID) is a PAGE, not a database:
//   - a summary TABLE block carries metadata (SOP #, Title, Version, Effective
//     Date, Department), and
//   - one CHILD PAGE per SOP carries the full procedure text.
// We parse the table for metadata, enumerate the child pages for
// sop_number/title/content/notion_page_id, merge the two, and upsert by
// sop_number (admin client — sop_entries is server-owned).
//
// Auth: internal. Accepts either a matching x-sop-sync-secret header (for cron)
// or an authenticated session (for a manual call from the app).
//
// Notion access uses the raw REST API via fetch (no @notionhq/client dep). The
// route is inert until NOTION_API_KEY is set on the driver-app env — without it
// it returns 501 with a clear message (no public exposure either way).

import { NextRequest, NextResponse } from 'next/server'
import { cookies }                   from 'next/headers'
import { createServerClient }        from '@supabase/ssr'
import { createClient }              from '@supabase/supabase-js'

export const runtime     = 'nodejs'
export const dynamic     = 'force-dynamic'
export const maxDuration = 60 // Notion fan-out (one call per SOP page) can be slow

const SOP_LIBRARY_PAGE_ID = '3590aa6451b8816aa156c77f605facfe'
const NOTION_BASE         = 'https://api.notion.com/v1'
const NOTION_VERSION      = '2022-06-28'

const TEXT_BLOCK_TYPES = [
  'paragraph', 'heading_1', 'heading_2', 'heading_3',
  'bulleted_list_item', 'numbered_list_item', 'to_do', 'quote', 'callout', 'toggle',
] as const

// ─── Clients ──────────────────────────────────────────────────────────────────

function getSessionClient() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch { /* route-handler context — cookie writes no-op */ }
        },
      },
    }
  )
}

function getAdminClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// ─── Notion helpers ─────────────────────────────────────────────────────────

interface NotionBlock {
  id:           string
  type:         string
  has_children: boolean
  child_page?:  { title: string }
  table_row?:   { cells: Array<Array<{ plain_text?: string }>> }
  [key: string]: unknown
}

async function notionGet(path: string, token: string): Promise<{ results: NotionBlock[]; has_more: boolean; next_cursor: string | null }> {
  const res = await fetch(`${NOTION_BASE}${path}`, {
    headers: {
      Authorization:  `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type':   'application/json',
    },
    cache: 'no-store',
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Notion ${res.status} on ${path}: ${body.slice(0, 200)}`)
  }
  return res.json()
}

async function listChildren(blockId: string, token: string): Promise<NotionBlock[]> {
  const out: NotionBlock[] = []
  let cursor: string | null = null
  do {
    const qs   = cursor ? `?page_size=100&start_cursor=${cursor}` : `?page_size=100`
    const data = await notionGet(`/blocks/${blockId}/children${qs}`, token)
    out.push(...(data.results ?? []))
    cursor = data.has_more ? data.next_cursor : null
  } while (cursor)
  return out
}

function richTextToPlain(rt: unknown): string {
  if (!Array.isArray(rt)) return ''
  return rt.map((t) => (t && typeof t === 'object' && 'plain_text' in t ? String((t as { plain_text?: string }).plain_text ?? '') : '')).join('')
}

// Collect plain text from a page's body, recursing into nested blocks up to a
// bounded depth (toggles, nested lists). Child pages/databases are not followed.
async function collectText(blockId: string, token: string, depth = 0): Promise<string> {
  if (depth > 2) return ''
  const blocks = await listChildren(blockId, token)
  const parts: string[] = []
  for (const b of blocks) {
    const payload = b[b.type] as { rich_text?: unknown } | undefined
    if ((TEXT_BLOCK_TYPES as readonly string[]).includes(b.type) && payload?.rich_text) {
      const line = richTextToPlain(payload.rich_text)
      if (line.trim()) parts.push(line)
    }
    if (b.has_children && b.type !== 'child_page' && b.type !== 'child_database' && b.type !== 'table') {
      const nested = await collectText(b.id, token, depth + 1)
      if (nested.trim()) parts.push(nested)
    }
  }
  return parts.join('\n')
}

interface SopMeta {
  title:          string
  version:        string | null
  effective_date: string | null
  department:     string | null
}

function parseDate(s: string): string | null {
  if (!s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

// Build sop_number -> metadata from the summary table block's rows.
function parseTable(rows: NotionBlock[]): Map<string, SopMeta> {
  const meta = new Map<string, SopMeta>()
  // Row 0 is the header (SOP # / Title / Version / Effective Date / Department).
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i].table_row?.cells ?? []
    const sop   = richTextToPlain(cells[0]).trim()
    if (!/^SOP-\d+/i.test(sop)) continue
    meta.set(sop.toUpperCase(), {
      title:          richTextToPlain(cells[1]).trim(),
      version:        richTextToPlain(cells[2]).trim() || null,
      effective_date: parseDate(richTextToPlain(cells[3]).trim()),
      department:     richTextToPlain(cells[4]).trim() || null,
    })
  }
  return meta
}

// "SOP-001 – Gooseneck Trailer Detachment" → { SOP-001, Gooseneck... }
function parseSopTitle(raw: string): { sop_number: string; title: string } {
  const m = raw.match(/^(SOP-\d+)\s*[–—-]\s*(.+)$/i)
  if (m) return { sop_number: m[1].toUpperCase(), title: m[2].trim() }
  const m2 = raw.match(/^(SOP-\d+)/i)
  return { sop_number: m2 ? m2[1].toUpperCase() : raw.trim(), title: raw.trim() }
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function isAuthorized(request: NextRequest): Promise<boolean> {
  const secret = process.env.SOP_SYNC_SECRET
  if (secret && request.headers.get('x-sop-sync-secret') === secret) return true
  const session = getSessionClient()
  const { data: { user } } = await session.auth.getUser()
  return !!user
}

// ─── Handler ────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const token = process.env.NOTION_API_KEY
  if (!token) {
    return NextResponse.json(
      { error: 'NOTION_API_KEY is not configured — SOP sync cannot run.' },
      { status: 501 }
    )
  }

  const nowIso = new Date().toISOString()
  const errors: Array<Record<string, string>> = []

  // 1. Library page children → the summary table + the per-SOP child pages.
  let topLevel: NotionBlock[]
  try {
    topLevel = await listChildren(SOP_LIBRARY_PAGE_ID, token)
  } catch (e) {
    return NextResponse.json(
      { error: `Failed to read SOP Library page: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 }
    )
  }

  // 2. Metadata from the summary table (keyed by SOP #).
  let tableMeta = new Map<string, SopMeta>()
  const tableBlock = topLevel.find((b) => b.type === 'table')
  if (tableBlock) {
    try {
      tableMeta = parseTable(await listChildren(tableBlock.id, token))
    } catch (e) {
      errors.push({ table: e instanceof Error ? e.message : String(e) })
    }
  }

  // 3. One row per SOP child page; content from the page body, metadata merged.
  const sopPages = topLevel.filter((b) => b.type === 'child_page')
  const rows: Array<{
    sop_number: string; title: string; content: string
    department: string | null; version: string | null; effective_date: string | null
    notion_page_id: string; last_synced_at: string; updated_at: string
  }> = []

  for (const page of sopPages) {
    try {
      const { sop_number, title } = parseSopTitle(page.child_page?.title ?? '')
      const content = await collectText(page.id, token)
      const meta    = tableMeta.get(sop_number)
      rows.push({
        sop_number,
        title:          meta?.title || title,
        content:        content || (meta?.title || title), // content is NOT NULL
        department:     meta?.department ?? null,
        version:        meta?.version ?? null,
        effective_date: meta?.effective_date ?? null,
        notion_page_id: page.id,
        last_synced_at: nowIso,
        updated_at:     nowIso,
      })
    } catch (e) {
      errors.push({ page: page.id, message: e instanceof Error ? e.message : String(e) })
    }
  }

  // 4. Upsert by sop_number.
  if (rows.length > 0) {
    const admin = getAdminClient()
    const { error } = await admin
      .from('sop_entries')
      .upsert(rows, { onConflict: 'sop_number' })
    if (error) {
      console.error('[/api/sop/sync] upsert failed:', error.message)
      errors.push({ upsert: error.message })
    }
  }

  return NextResponse.json(
    { synced: rows.length, errors },
    { status: 200, headers: { 'Cache-Control': 'no-store' } }
  )
}
