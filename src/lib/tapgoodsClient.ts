// ─── TapGoods GraphQL client (server-side only) ───────────────────────────────
// Never import this file from client components — API key lives here.

const TAPGOODS_ENDPOINT = 'https://openapi.tapgoods.com/v1/external/graphql'

function getEnv(key: string): string {
  const val = process.env[key]
  if (!val) {
    throw new Error(`Missing required environment variable: ${key}`)
  }
  return val
}

export interface GraphQLResponse<T> {
  data?: T
  errors?: Array<{ message: string }>
}

export async function tapgoodsQuery<T>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const apiKey     = getEnv('TAPGOODS_API_KEY')
  // business-id and location-id are optional — some API keys are already scoped
  const businessId = process.env.TAPGOODS_BUSINESS_ID
  const locationId = process.env.TAPGOODS_LOCATION_ID

  const headers: Record<string, string> = {
    'Content-Type':  'application/json',
    'Authorization': `Bearer ${apiKey}`,
  }
  if (businessId) headers['business-id'] = businessId
  if (locationId) headers['location-id'] = locationId

  const res = await fetch(TAPGOODS_ENDPOINT, {
    method:  'POST',
    headers,
    body: JSON.stringify({ query, variables }),
    // Next.js: don't cache — always fresh for today's routes
    cache: 'no-store',
  })

  if (!res.ok) {
    throw new Error(`TapGoods HTTP ${res.status}: ${res.statusText}`)
  }

  const json: GraphQLResponse<T> = await res.json()

  if (json.errors?.length) {
    throw new Error(
      `TapGoods GraphQL error: ${json.errors.map((e) => e.message).join('; ')}`
    )
  }

  if (!json.data) {
    throw new Error('TapGoods returned no data')
  }

  return json.data
}
