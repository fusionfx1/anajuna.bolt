import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const OANDA_PRACTICE_BASE = "https://api-fxpractice.oanda.com";
const OANDA_LIVE_BASE = "https://api-fxtrade.oanda.com";

// OANDA credentials — read from secrets first, fall back to embedded defaults.
// These values never leave the server; the browser only sees the proxied OANDA response.
const OANDA_ACCESS_TOKEN =
  Deno.env.get("OANDA_ACCESS_TOKEN") ??
  "7b4e225e4c33be224c751f702ac5c5f4-1d74edbce41ae7ca5c592fd40cfd5d8b";
const OANDA_ACCOUNT_ID =
  Deno.env.get("OANDA_ACCOUNT_ID") ?? "5333758";
const OANDA_ACCOUNT_TYPE =
  Deno.env.get("OANDA_ACCOUNT_TYPE") ?? "practice";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    // Verify caller is authenticated via Supabase JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse the target OANDA path from the URL
    // Incoming: /oanda-proxy?path=/v3/accounts/{id}/summary&method=GET
    const url = new URL(req.url);
    const oandaPath = url.searchParams.get("path");
    const method = url.searchParams.get("method") ?? req.method;

    if (!oandaPath) {
      return new Response(JSON.stringify({ error: "Missing 'path' query parameter" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const baseUrl = OANDA_ACCOUNT_TYPE === "live" ? OANDA_LIVE_BASE : OANDA_PRACTICE_BASE;
    const targetUrl = `${baseUrl}${oandaPath}`;

    const oandaHeaders: Record<string, string> = {
      Authorization: `Bearer ${OANDA_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      "Accept-Datetime-Format": "RFC3339",
    };

    let body: string | undefined;
    if (req.method === "POST" || req.method === "PUT") {
      body = await req.text();
    }

    const oandaRes = await fetch(targetUrl, {
      method,
      headers: oandaHeaders,
      body,
    });

    const responseText = await oandaRes.text();

    return new Response(responseText, {
      status: oandaRes.status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
