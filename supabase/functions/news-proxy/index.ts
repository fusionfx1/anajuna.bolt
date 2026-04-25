import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const FF_RSS_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.xml";

// ── In-memory cache (survives between warm requests, resets on cold start) ───
let cachedPayload: string | null = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// ── Country → flag emoji map ──────────────────────────────────────────────────
const COUNTRY_FLAGS: Record<string, string> = {
  USD: "🇺🇸", EUR: "🇪🇺", GBP: "🇬🇧", JPY: "🇯🇵",
  CAD: "🇨🇦", AUD: "🇦🇺", NZD: "🇳🇿", CHF: "🇨🇭",
  CNY: "🇨🇳", CNH: "🇨🇳", ALL: "🌐",
};

// ── XML helpers ───────────────────────────────────────────────────────────────

/** Grab the text content of the first matching tag */
function xmlText(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([^<]*)<\\/${tag}>`, "i");
  const m  = re.exec(xml);
  return (m?.[1] ?? m?.[2] ?? "").trim();
}

/** Parse the Forex Factory RSS <item> blocks */
function parseItems(xml: string) {
  const items: unknown[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;

  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1];

    const title    = xmlText(block, "title");
    const country  = xmlText(block, "country");
    const dateStr  = xmlText(block, "date");       // e.g. "04-25-2026"
    const timeStr  = xmlText(block, "time");       // e.g. "8:30am" or "All Day" or ""
    const impact   = xmlText(block, "impact").toLowerCase() as "low" | "medium" | "high";
    const forecast = xmlText(block, "forecast");
    const previous = xmlText(block, "previous");
    const actual   = xmlText(block, "actual");

    // Build UTC timestamp ────────────────────────────────────────────────────
    // The feed dates are already in Eastern Time (ET). We normalise to UTC.
    let utcMs: number | null = null;

    if (dateStr) {
      // date format: MM-DD-YYYY
      const [mm, dd, yyyy] = dateStr.split("-");
      let hour = 0, minute = 0;
      let allDay = false;

      if (timeStr && timeStr !== "" && timeStr.toLowerCase() !== "all day" && timeStr.toLowerCase() !== "tentative") {
        const timeLower = timeStr.toLowerCase().replace(/\s/g, "");
        const pm        = timeLower.endsWith("pm");
        const am        = timeLower.endsWith("am");
        const digits    = timeLower.replace(/[apm]/g, "");
        const [h, min]  = digits.split(":").map(Number);
        hour   = h + (pm && h !== 12 ? 12 : 0) - (am && h === 12 ? 12 : 0);
        minute = min || 0;
      } else {
        allDay = true;
      }

      // ET = UTC-5 standard / UTC-4 DST
      // Simple DST check: second Sunday of March → first Sunday of November
      const dateForDst = new Date(Date.UTC(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd)));
      const isDst = isInDst(dateForDst);
      const offsetMs = (isDst ? 4 : 5) * 60 * 60 * 1000;

      const localMs = Date.UTC(
        parseInt(yyyy),
        parseInt(mm) - 1,
        parseInt(dd),
        hour,
        minute,
        0
      );
      utcMs = allDay ? localMs : localMs + offsetMs;
    }

    items.push({
      title,
      country,
      flag:     COUNTRY_FLAGS[country] ?? "🏳️",
      impact,
      forecast,
      previous,
      actual,
      utcMs,
    });
  }

  // Sort ascending by time
  items.sort((a: any, b: any) => (a.utcMs ?? 0) - (b.utcMs ?? 0));
  return items;
}

/** Rough US DST check: between 2nd Sunday in March and 1st Sunday in November */
function isInDst(utcDate: Date): boolean {
  const year  = utcDate.getUTCFullYear();
  const dstStart = nthSundayOfMonth(year, 2, 2);  // March 2nd Sunday
  const dstEnd   = nthSundayOfMonth(year, 10, 1); // November 1st Sunday
  return utcDate >= dstStart && utcDate < dstEnd;
}

function nthSundayOfMonth(year: number, month: number, n: number): Date {
  // month is 1-indexed
  const first = new Date(Date.UTC(year, month - 1, 1));
  const day   = first.getUTCDay(); // 0=Sun
  const offset = (7 - day) % 7;
  const dayOfMonth = 1 + offset + (n - 1) * 7;
  return new Date(Date.UTC(year, month - 1, dayOfMonth, 7, 0, 0)); // 2am ET ≈ 7am UTC
}

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const now = Date.now();

    // Serve from cache if still fresh
    if (cachedPayload && now < cacheExpiry) {
      return new Response(cachedPayload, {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "X-Cache": "HIT",
        },
      });
    }

    // Fetch from Forex Factory
    const res = await fetch(FF_RSS_URL, {
      headers: { "User-Agent": "FusionFX/1.0 (news calendar)" },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      throw new Error(`RSS fetch failed: ${res.status}`);
    }

    const xml   = await res.text();
    const items = parseItems(xml);

    cachedPayload = JSON.stringify({ ok: true, items, fetchedAt: now });
    cacheExpiry   = now + CACHE_TTL_MS;

    return new Response(cachedPayload, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "X-Cache": "MISS",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";

    // If we have stale cache, serve it rather than failing
    if (cachedPayload) {
      return new Response(cachedPayload, {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "X-Cache": "STALE",
        },
      });
    }

    return new Response(JSON.stringify({ ok: false, error: message, items: [] }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
