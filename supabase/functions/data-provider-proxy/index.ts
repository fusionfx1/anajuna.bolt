import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const PROVIDER_BASES: Record<string, string> = {
  eodhd: "https://eodhd.com/api",
  tiingo: "https://api.tiingo.com",
};

interface ProxyRequest {
  provider: "eodhd" | "tiingo";
  action?: "test" | "fetch";
  apiKey?: string;
  symbol?: string;
  from?: string;
  to?: string;
  period?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");

    // Resolve user if auth header present (optional — test+inlineKey works without user)
    let user: { id: string } | null = null;
    if (authHeader) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data } = await supabase.auth.getUser();
      user = data.user;
    }

    const body = await req.json() as ProxyRequest;
    const { provider, action = "fetch", apiKey: inlineKey, symbol, from, to, period = "d" } = body;

    if (!provider || !PROVIDER_BASES[provider]) {
      return new Response(JSON.stringify({ error: "Invalid provider" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Test action with inline key: validate the key directly — no DB lookup needed, no user required
    if (action === "test" && inlineKey) {
      const ok = await testProviderKey(provider, inlineKey);
      return new Response(JSON.stringify({ ok }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // All other actions require an authenticated user
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Read stored key via service role (bypasses RLS — key not readable by authenticated users)
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: storedKey, error: keyError } = await supabaseAdmin
      .from("data_provider_api_keys")
      .select("api_key")
      .eq("provider_id", provider)
      .eq("user_id", user.id)
      .maybeSingle();

    if (keyError || !storedKey) {
      return new Response(JSON.stringify({ error: `No ${provider} API key configured.` }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = storedKey.api_key;

    // Test action: verify key works with a minimal API call
    if (action === "test") {
      const ok = await testProviderKey(provider, apiKey);
      return new Response(JSON.stringify({ ok }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch action: proxy historical OHLCV data request
    if (!symbol || !from || !to) {
      return new Response(JSON.stringify({ error: "symbol, from, and to are required for fetch" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const candles = await fetchCandles(provider, apiKey, symbol, from, to, period);
    return new Response(JSON.stringify({ candles }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function testProviderKey(provider: string, apiKey: string): Promise<boolean> {
  try {
    if (provider === "eodhd") {
      const url = `https://eodhd.com/api/eod/AAPL.US?api_token=${apiKey}&fmt=json&limit=1`;
      const res = await fetch(url);
      return res.ok;
    }
    if (provider === "tiingo") {
      const url = `https://api.tiingo.com/tiingo/daily/AAPL/prices?startDate=2024-01-01&endDate=2024-01-05`;
      const res = await fetch(url, { headers: { Authorization: `Token ${apiKey}` } });
      return res.ok;
    }
    return false;
  } catch {
    return false;
  }
}

async function fetchCandles(
  provider: string,
  apiKey: string,
  symbol: string,
  from: string,
  to: string,
  period: string
): Promise<unknown[]> {
  if (provider === "eodhd") {
    const params = new URLSearchParams({ api_token: apiKey, fmt: "json", period, from, to });
    const url = `https://eodhd.com/api/eod/${symbol}?${params}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`EODHD error ${res.status}`);
    return res.json();
  }
  if (provider === "tiingo") {
    const params = new URLSearchParams({ startDate: from, endDate: to });
    const url = `https://api.tiingo.com/tiingo/daily/${symbol}/prices?${params}`;
    const res = await fetch(url, {
      headers: { Authorization: `Token ${apiKey}`, "Content-Type": "application/json" },
    });
    if (!res.ok) throw new Error(`Tiingo error ${res.status}`);
    return res.json();
  }
  throw new Error(`Unknown provider: ${provider}`);
}
