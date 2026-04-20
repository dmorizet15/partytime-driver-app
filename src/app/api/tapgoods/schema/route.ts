// ─── GET /api/tapgoods/schema ─────────────────────────────────────────────────
// Temporary introspection endpoint — confirms field names on key types.
// Delete this file once all field names are verified.

import { NextResponse }    from 'next/server'
import { tapgoodsQuery }   from '@/lib/tapgoodsClient'

const INTROSPECT_TYPES = `
  query {
    phoneNumberType: __type(name: "PhoneNumber") {
      fields {
        name
        type { name kind ofType { name kind } }
      }
    }
    rentalType: __type(name: "Rental") {
      fields {
        name
        type { name kind ofType { name kind } }
      }
    }
  }
`

export async function GET() {
  try {
    const data = await tapgoodsQuery<{
      phoneNumberType: { fields: { name: string }[] } | null
      rentalType:      { fields: { name: string }[] } | null
    }>(INTROSPECT_TYPES)

    return NextResponse.json({
      PhoneNumber: data.phoneNumberType?.fields?.map((f) => f.name).sort() ?? [],
      Rental:      data.rentalType?.fields?.map((f) => f.name).sort()      ?? [],
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
