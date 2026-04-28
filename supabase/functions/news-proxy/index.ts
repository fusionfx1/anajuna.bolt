import "jsr:@supabase/functions-js/edge-runtime.d.ts"

interface NewsItem {
  country: string
  date: string
  time: string
  timezone: string
  currency: string
  event: string
  impact: string
  forecast: string
  previous: string
  actual: string
}

interface NewsResponse {
  ok: boolean
  items: NewsItem[]
  error?: string
}

// Mock news data for development
const MOCK_NEWS: NewsItem[] = [
  {
    country: "US",
    date: "2026-04-28",
    time: "13:30",
    timezone: "EST",
    currency: "USD",
    event: "FOMC Interest Rate Decision",
    impact: "high",
    forecast: "5.50%",
    previous: "5.50%",
    actual: ""
  },
  {
    country: "EUR",
    date: "2026-04-28",
    time: "14:00",
    timezone: "CET",
    currency: "EUR",
    event: "ECB Interest Rate Decision",
    impact: "high",
    forecast: "4.25%",
    previous: "4.25%",
    actual: ""
  },
  {
    country: "UK",
    date: "2026-04-29",
    time: "12:00",
    timezone: "GMT",
    currency: "GBP",
    event: "BOE Interest Rate Decision",
    impact: "high",
    forecast: "5.25%",
    previous: "5.25%",
    actual: ""
  }
]

export default async (req: Request): Promise<Response> => {
  // Enable CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      }
    })
  }

  try {
    // Return mock news data
    const response: NewsResponse = {
      ok: true,
      items: MOCK_NEWS
    }

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(
      JSON.stringify({ ok: false, error: message }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
}
