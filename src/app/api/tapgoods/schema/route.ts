import { NextResponse } from 'next/server'
import { tapgoodsQuery } from '@/lib/tapgoodsClient'
const Q = `
  query {
    __schema {
      queryType {
        fields { name }
      }
    }
  }
`
export async function GET() {
  try {
    const data = await tapgoodsQuery<any>(Q)
    const queries = data.__schema?.queryType?.fields?.map((f: any) => f.name).sort()
    return NextResponse.json({ availableQueries: queries })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }
}
