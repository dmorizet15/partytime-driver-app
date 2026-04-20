import { NextResponse } from 'next/server'
import { tapgoodsQuery } from '@/lib/tapgoodsClient'
const Q = `
  query {
    __schema {
      queryType {
        fields {
          name
          args { name type { name kind ofType { name kind } } }
        }
      }
    }
  }
`
export async function GET() {
  try {
    const data = await tapgoodsQuery<any>(Q)
    const getRentals = data.__schema?.queryType?.fields?.find((f: any) => f.name === 'getRentals')
    return NextResponse.json({ getRentalsArgs: getRentals?.args })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }
}
