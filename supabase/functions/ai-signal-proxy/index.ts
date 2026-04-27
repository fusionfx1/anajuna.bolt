import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface SignalRequest {
  symbol: string;
  timeframe: string;
  candles: Array<{
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>;
  indicators: Record<string, number>;
  strategy_context?: string;
}

interface ProxyRequest {
  provider_id: string;
  request?: SignalRequest;
  test?: boolean;
}

interface AISignalResponse {
  signal: "BUY" | "SELL" | "HOLD";
  confidence: number;
  reasoning: string;
  suggested_sl?: number | null;
  suggested_tp?: number | null;
  key_factors: string[];
  latency_ms: number;
}

function buildUserMessage(req: SignalRequest): string {
  const recent = req.candles.slice(-10);
  const lastCandle = req.candles.at(-1);
  const candleStr = recent
    .map(c => `O:${c.open.toFixed(5)} H:${c.high.toFixed(5)} L:${c.low.toFixed(5)} C:${c.close.toFixed(5)} V:${c.volume}`)
    .join("\n");

  const indicatorStr = Object.entries(req.indicators)
    .map(([k, v]) => `${k}: ${typeof v === "number" ? v.toFixed(4) : v}`)
    .join(", ");

  return `Symbol: ${req.symbol} | Timeframe: ${req.timeframe}
Last 10 candles (oldest→newest):
${candleStr}

Current price: ${lastCandle?.close.toFixed(5) ?? "N/A"}
Indicators: ${indicatorStr}
${req.strategy_context ? `Strategy context: ${req.strategy_context}` : ""}

Generate a trading signal as JSON only.`;
}

async function callOpenAI(
  endpoint: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  userMessage: string,
  temperature: number,
  maxTokens: number
): Promise<string> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${text}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "{}";
}

async function callAnthropic(
  endpoint: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  userMessage: string,
  temperature: number,
  maxTokens: number
): Promise<string> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic error ${res.status}: ${text}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text ?? "{}";
}

async function callGemini(
  endpoint: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  userMessage: string,
  temperature: number,
  maxTokens: number
): Promise<string> {
  const url = `${endpoint}/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text: userMessage }] }],
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini error ${res.status}: ${text}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
}

function parseSignalResponse(raw: string): AISignalResponse {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      `AI provider returned non-JSON response (truncated): ${raw.slice(0, 240)}`,
    );
  }

  if (!parsed.signal || !["BUY", "SELL", "HOLD"].includes(String(parsed.signal))) {
    throw new Error(
      `AI provider response missing/invalid 'signal' field: ${JSON.stringify(parsed).slice(0, 240)}`,
    );
  }

  const confidence = Math.min(1, Math.max(0, parseFloat(String(parsed.confidence)) || 0.5));
  return {
    signal: parsed.signal as "BUY" | "SELL" | "HOLD",
    confidence,
    reasoning: String(parsed.reasoning ?? "No reasoning provided"),
    suggested_sl: (parsed.suggested_sl as number | null | undefined) ?? null,
    suggested_tp: (parsed.suggested_tp as number | null | undefined) ?? null,
    key_factors: Array.isArray(parsed.key_factors) ? (parsed.key_factors as string[]) : [],
    latency_ms: 0,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: ProxyRequest = await req.json();

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: storedKey, error: keyError } = await supabaseAdmin
      .from("ai_provider_api_keys")
      .select("api_key, provider_id")
      .eq("provider_id", body.provider_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (keyError || !storedKey) {
      return new Response(JSON.stringify({ error: "Provider API key not found. Please reconfigure the provider." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: providerRow, error: providerError } = await supabaseAdmin
      .from("ai_provider_configs")
      .select("*")
      .eq("id", body.provider_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (providerError || !providerRow) {
      return new Response(JSON.stringify({ error: "Provider not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body.test) {
      return new Response(JSON.stringify({ ok: true, message: "Provider config found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!body.request) {
      return new Response(JSON.stringify({ error: "Missing request body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey: string = storedKey.api_key;
    const userMessage = buildUserMessage(body.request);
    const t0 = Date.now();
    let rawResponse = "{}";

    if (providerRow.provider === "openai" || providerRow.provider === "custom") {
      rawResponse = await callOpenAI(
        providerRow.api_endpoint,
        apiKey,
        providerRow.model_name,
        providerRow.system_prompt,
        userMessage,
        providerRow.temperature,
        providerRow.max_tokens
      );
    } else if (providerRow.provider === "anthropic") {
      rawResponse = await callAnthropic(
        providerRow.api_endpoint,
        apiKey,
        providerRow.model_name,
        providerRow.system_prompt,
        userMessage,
        providerRow.temperature,
        providerRow.max_tokens
      );
    } else if (providerRow.provider === "gemini") {
      rawResponse = await callGemini(
        providerRow.api_endpoint,
        apiKey,
        providerRow.model_name,
        providerRow.system_prompt,
        userMessage,
        providerRow.temperature,
        providerRow.max_tokens
      );
    }

    const latency_ms = Date.now() - t0;
    const result = parseSignalResponse(rawResponse);
    result.latency_ms = latency_ms;

    return new Response(JSON.stringify(result), {
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
