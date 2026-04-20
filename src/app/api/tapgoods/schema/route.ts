import { NextResponse }  from 'next/server'
import { tapgoodsQuery } from '@/lib/tapgoodsClient'

export async function GET() {
  try {
    const data = await tapgoodsQuery<any>(`
      query {
        __type(name: "ExternalQuery") {
          fields {
            name
            args { name type { name kind ofType { name kind } } }
          }
        }
      }
    `)
    const fields = data.__type?.fields ?? []
    const getRentals = fields.find((f: any) => f.name === 'getRentals')
    return NextResponse.json({
      getRentals_args: getRentals?.args ?? [],
      all_query_fields: fields.map((f: any) => f.name),
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) })
  }
}
