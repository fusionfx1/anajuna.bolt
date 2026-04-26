import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const OANDA_PRACTICE_BASE = "https://api-fxpractice.oanda.com";

interface OandaCandle {
  time: string;
  mid?: { o: string; h: string; l: string; c: string };
  volume?: number;
  complete?: boolean;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { instrument, granularity, from, to, oandaToken, oandaAccountType } =
      await req.json();

    if (!instrument || !granularity || !from || !to) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: instrument, granularity, from, to" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let candles: { time: string; open: number; high: number; low: number; close: number; volume: number }[] = [];

    if (oandaToken) {
      const baseUrl = oandaAccountType === "live"
        ? "https://api-fxtrade.oanda.com"
        : OANDA_PRACTICE_BASE;

      // OANDA limits to 5000 candles per request; paginate
      const fromMs = new Date(from).getTime();
      const toMs = new Date(to).getTime();
      let cursor = fromMs;

      while (cursor < toMs) {
        const url = new URL(`${baseUrl}/v3/instruments/${instrument}/candles`);
        url.searchParams.set("granularity", granularity);
        url.searchParams.set("from", new Date(cursor).toISOString());
        url.searchParams.set("to", new Date(toMs).toISOString());
        url.searchParams.set("count", "5000");
        url.searchParams.set("price", "M");

        const res = await fetch(url.toString(), {
          headers: {
            Authorization: `Bearer ${oandaToken}`,
            "Content-Type": "application/json",
            "Accept-Datetime-Format": "RFC3339",
          },
          signal: AbortSignal.timeout(30000),
        });

        if (!res.ok) {
          const errText = await res.text();
          return new Response(
            JSON.stringify({ error: `OANDA API error: ${res.status} - ${errText}` }),
            { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        const data = await res.json();
        const batch: OandaCandle[] = data.candles ?? [];

        if (batch.length === 0) break;

        for (const c of batch) {
          if (c.complete === false) continue;
          const mid = c.mid;
          if (!mid) continue;
          candles.push({
            time: c.time,
            open: parseFloat(mid.o),
            high: parseFloat(mid.h),
            low: parseFloat(mid.l),
            close: parseFloat(mid.c),
            volume: c.volume ?? 0,
          });
        }

        // Advance cursor past last candle
        const lastTime = new Date(batch[batch.length - 1].time).getTime();
        if (lastTime <= cursor) break;
        cursor = lastTime + 1;

        if (batch.length < 5000) break;
      }
    } else {
      // Generate simulated candles server-side
      candles = generateSimulated(instrument, granularity, from, to);
    }

    if (candles.length === 0) {
      return new Response(
        JSON.stringify({ inserted: 0, message: "No candles to insert" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Upsert into historical_candles in batches
    let inserted = 0;
    const BATCH = 500;
    for (let i = 0; i < candles.length; i += BATCH) {
      const chunk = candles.slice(i, i + BATCH).map((c) => ({
        instrument,
        granularity,
        time: typeof c.time === "string" ? c.time : new Date(c.time).toISOString(),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      }));

      const { error } = await supabase
        .from("historical_candles")
        .upsert(chunk, { onConflict: "instrument,granularity,time" });

      if (error) {
        return new Response(
          JSON.stringify({ error: `DB upsert failed: ${error.message}`, inserted }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      inserted += chunk.length;
    }

    return new Response(
      JSON.stringify({ inserted, total: candles.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

function generateSimulated(
  instrument: string,
  granularity: string,
  from: string,
  to: string,
): { time: string; open: number; high: number; low: number; close: number; volume: number }[] {
  const BASE: Record<string, number> = {
    EUR_USD: 1.08542, GBP_USD: 1.26415, USD_JPY: 153.24, XAU_USD: 2324.50,
    AUD_USD: 0.65318, USD_CAD: 1.36241, NZD_USD: 0.60812,
  };
  const STEP: Record<string, number> = {
    M1: 60, M5: 300, M15: 900, H1: 3600, H4: 14400, D1: 86400,
  };

  const step = STEP[granularity] ?? 3600;
  const isJpy = instrument.includes("JPY");
  const isGold = instrument.includes("XAU");
  const pip = isJpy ? 0.01 : isGold ? 0.1 : 0.0001;
  const dp = isJpy ? 3 : isGold ? 2 : 5;

  const startSec = Math.floor(new Date(from).getTime() / 1000);
  const endSec = Math.floor(new Date(to).getTime() / 1000);

  const result: { time: string; open: number; high: number; low: number; close: number; volume: number }[] = [];
  let price = BASE[instrument] ?? 1.0;
  let seed = instrument.charCodeAt(0) * 1000 + granularity.charCodeAt(0);

  function rand() {
    seed = (seed * 16807 + 0) % 2147483647;
    return (seed - 1) / 2147483646;
  }

  for (let t = startSec; t < endSec; t += step) {
    const bodyPips = (rand() * 8 + 2) * pip;
    const wickPips = (rand() * 6 + 1) * pip;
    const bullish = rand() > 0.48;
    const trendBias = Math.sin(t / 86400 / 30) * 2 * pip;

    const open = price;
    const close = parseFloat((open + (bullish ? 1 : -1) * bodyPips + trendBias).toFixed(dp));
    const high = parseFloat((Math.max(open, close) + wickPips).toFixed(dp));
    const low = parseFloat((Math.min(open, close) - wickPips).toFixed(dp));

    result.push({
      time: new Date(t * 1000).toISOString(),
      open, high, low, close,
      volume: Math.floor(rand() * 500 + 100),
    });
    price = close;
  }

  return result;
}
