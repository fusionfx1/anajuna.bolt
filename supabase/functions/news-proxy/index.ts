import "jsr:@supabase/functions-js/edge-runtime.d.ts"

/** Matches `NewsEvent` in `src/types/news.ts` */
interface NewsEventRow {
  title: string
  country: string
  flag: string
  impact: "low" | "medium" | "high"
  forecast: string
  previous: string
  actual: string
  utcMs: number | null
}

interface NewsResponse {
  ok: boolean
  items: NewsEventRow[]
  fetchedAt: number
  source: "finnhub" | "mock"
  error?: string
}

// ── Country / flag helpers ────────────────────────────────────────────────────

const FLAG_MAP: Record<string, string> = {
  US: "🇺🇸", EUR: "🇪🇺", EU: "🇪🇺", UK: "🇬🇧", GB: "🇬🇧",
  JP: "🇯🇵", AU: "🇦🇺", CA: "🇨🇦", CH: "🇨🇭", NZ: "🇳🇿", CN: "🇨🇳",
}

function flagForCountry(code: string): string {
  return FLAG_MAP[code?.toUpperCase() ?? ""] ?? "🌍"
}

function mapImpact(finnhubImpact: string): "low" | "medium" | "high" {
  // Finnhub uses 1 (low) / 2 (medium) / 3 (high) as strings or numbers
  const n = parseInt(String(finnhubImpact), 10)
  if (n >= 3) return "high"
  if (n === 2) return "medium"
  return "low"
}

// ── Fallback mock data ────────────────────────────────────────────────────────

const MOCK_ITEMS: NewsEventRow[] = [
  {
    title: "FOMC Interest Rate Decision",
    country: "US", flag: "🇺🇸", impact: "high",
    forecast: "5.50%", previous: "5.50%", actual: "",
    utcMs: Date.UTC(2026, 4, 7, 18, 0),
  },
  {
    title: "ECB Interest Rate Decision",
    country: "EUR", flag: "🇪🇺", impact: "high",
    forecast: "4.25%", previous: "4.25%", actual: "",
    utcMs: Date.UTC(2026, 4, 8, 11, 45),
  },
  {
    title: "BOE Interest Rate Decision",
    country: "UK", flag: "🇬🇧", impact: "high",
    forecast: "5.25%", previous: "5.25%", actual: "",
    utcMs: Date.UTC(2026, 4, 9, 11, 0),
  },
  {
    title: "US Initial Jobless Claims",
    country: "US", flag: "🇺🇸", impact: "medium",
    forecast: "218K", previous: "223K", actual: "",
    utcMs: Date.UTC(2026, 4, 8, 12, 30),
  },
]

// ── Finnhub fetch ─────────────────────────────────────────────────────────────

interface FinnhubEvent {
  event: string
  country: string
  unit: string
  estimate: string | null
  prev: string | null
  actual: string | null
  impact: string | number
  time: string // ISO 8601 UTC
}

async function fetchFinnhub(apiKey: string): Promise<NewsEventRow[]> {
  // Fetch next 7 days of economic calendar
  const from = new Date().toISOString().slice(0, 10)
  const to = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const url = `https://finnhub.io/api/v1/calendar/economic?from=${from}&to=${to}&token=${apiKey}`

  const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
  if (!res.ok) throw new Error(`Finnhub HTTP ${res.status}`)

  const data = await res.json() as { economicCalendar?: FinnhubEvent[] }
  const events = data.economicCalendar ?? []

  return events
    .filter(e => e.event && e.time)
    .map((e): NewsEventRow => ({
      title: e.event,
      country: e.country ?? "",
      flag: flagForCountry(e.country ?? ""),
      impact: mapImpact(String(e.impact ?? 1)),
      forecast: e.estimate != null ? String(e.estimate) + (e.unit ? " " + e.unit : "") : "",
      previous: e.prev != null ? String(e.prev) + (e.unit ? " " + e.unit : "") : "",
      actual: e.actual != null ? String(e.actual) + (e.unit ? " " + e.unit : "") : "",
      utcMs: new Date(e.time).getTime(),
    }))
    .filter(e => !isNaN(e.utcMs as number))
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    })
  }

  const corsHeaders = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  }

  try {
    const finnhubKey = Deno.env.get("FINNHUB_API_KEY")

    let items: NewsEventRow[]
    let source: "finnhub" | "mock"

    if (finnhubKey) {
      try {
        items = await fetchFinnhub(finnhubKey)
        source = "finnhub"
      } catch {
        // Finnhub failed — fall back to mock so the UI never breaks
        items = MOCK_ITEMS
        source = "mock"
      }
    } else {
      items = MOCK_ITEMS
      source = "mock"
    }

    const response: NewsResponse = {
      ok: true,
      items,
      fetchedAt: Date.now(),
      source,
    }

    return new Response(JSON.stringify(response), { status: 200, headers: corsHeaders })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return new Response(
      JSON.stringify({ ok: false, items: [], fetchedAt: Date.now(), source: "mock", error: message }),
      { status: 500, headers: corsHeaders },
    )
  }
}
