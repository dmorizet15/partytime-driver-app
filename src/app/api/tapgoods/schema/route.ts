import { NextResponse } from 'next/server'
import { tapgoodsQuery } from '@/lib/tapgoodsClient'
const INTROSPECT = `query { __type(name: "Rental") { fields { name } } }`
export async function GET() {
  try {
    const data = await tapgoodsQuery<any>(INTROSPECT)
    const fields = data.__type?.fields?.map((f: any) => f.name).sort() ?? []
    return NextResponse.json({ fields })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }
}
