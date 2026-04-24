export type Instrument = 'EUR_USD' | 'GBP_USD' | 'USD_JPY' | 'XAU_USD';
export type Granularity = 'M1' | 'M5' | 'M15' | 'H1';

export interface OHLCVCandle {
  time: number;   // Unix seconds (required by lightweight-charts)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// OANDA raw candle shape returned from the REST API
interface OandaCandle {
  time: string;
  mid?: { o: string; h: string; l: string; c: string };
  bid?: { o: string; h: string; l: string; c: string };
  ask?: { o: string; h: string; l: string; c: string };
  volume?: number;
  complete?: boolean;
}

const OANDA_PRACTICE_BASE = 'https://api-fxpractice.oanda.com';
const OANDA_LIVE_BASE = 'https://api-fxtrade.oanda.com';

function getBaseUrl(): string {
  const base = import.meta.env.VITE_OANDA_BASE_URL as string | undefined;
  return base?.includes('fxtrade') ? OANDA_LIVE_BASE : OANDA_PRACTICE_BASE;
}

function getHeaders(): Record<string, string> {
  const token = import.meta.env.VITE_OANDA_ACCESS_TOKEN as string | undefined;
  return {
    Authorization: `Bearer ${token ?? ''}`,
    'Content-Type': 'application/json',
    'Accept-Datetime-Format': 'RFC3339',
  };
}

export async function fetchCandles(
  instrument: Instrument,
  granularity: Granularity,
  count = 500
): Promise<OHLCVCandle[]> {
  const accountId = import.meta.env.VITE_OANDA_ACCOUNT_ID as string | undefined;

  if (!accountId || !import.meta.env.VITE_OANDA_ACCESS_TOKEN) {
    return generateSimulatedCandles(instrument, granularity, count);
  }

  try {
    const url = new URL(
      `${getBaseUrl()}/v3/instruments/${instrument}/candles`
    );
    url.searchParams.set('granularity', granularity);
    url.searchParams.set('count', String(count));
    url.searchParams.set('price', 'M'); // mid prices

    const res = await fetch(url.toString(), { headers: getHeaders() });
    if (!res.ok) throw new Error(`OANDA candles HTTP ${res.status}`);

    const data = await res.json();
    const candles: OandaCandle[] = data.candles ?? [];

    return candles
      .filter(c => c.complete !== false || candles.indexOf(c) === candles.length - 1)
      .map(c => {
        const src = c.mid ?? c.bid ?? c.ask;
        return {
          time: Math.floor(new Date(c.time).getTime() / 1000),
          open: parseFloat(src?.o ?? '0'),
          high: parseFloat(src?.h ?? '0'),
          low: parseFloat(src?.l ?? '0'),
          close: parseFloat(src?.c ?? '0'),
          volume: c.volume ?? 0,
        };
      })
      .filter(c => c.open > 0);
  } catch {
    return generateSimulatedCandles(instrument, granularity, count);
  }
}

// Produces a plausible candlestick history when OANDA credentials are absent
function generateSimulatedCandles(
  instrument: Instrument,
  granularity: Granularity,
  count: number
): OHLCVCandle[] {
  const BASE_PRICES: Record<Instrument, number> = {
    EUR_USD: 1.08542,
    GBP_USD: 1.26415,
    USD_JPY: 153.24,
    XAU_USD: 2324.50,
  };

  const GRANULARITY_SECONDS: Record<Granularity, number> = {
    M1: 60,
    M5: 300,
    M15: 900,
    H1: 3600,
  };

  const stepSec = GRANULARITY_SECONDS[granularity];
  const isJpy = instrument === 'USD_JPY';
  const isGold = instrument === 'XAU_USD';
  const pipSize = isJpy ? 0.01 : isGold ? 0.1 : 0.0001;

  const nowSec = Math.floor(Date.now() / 1000);
  const startSec = Math.floor((nowSec - count * stepSec) / stepSec) * stepSec;

  const candles: OHLCVCandle[] = [];
  let price = BASE_PRICES[instrument];

  for (let i = 0; i < count; i++) {
    const time = startSec + i * stepSec;
    const bodyPips = (Math.random() * 8 + 2) * pipSize;
    const wickPips = (Math.random() * 6 + 1) * pipSize;
    const bullish = Math.random() > 0.48;

    const open = price;
    const close = parseFloat((open + (bullish ? 1 : -1) * bodyPips).toFixed(isJpy ? 3 : isGold ? 2 : 5));
    const high = parseFloat((Math.max(open, close) + wickPips).toFixed(isJpy ? 3 : isGold ? 2 : 5));
    const low = parseFloat((Math.min(open, close) - wickPips).toFixed(isJpy ? 3 : isGold ? 2 : 5));

    candles.push({ time, open, high, low, close, volume: Math.floor(Math.random() * 500 + 100) });
    price = close;
  }

  return candles;
}

// Fetches only the latest N candles — used by the auto-refresh logic
export async function fetchLatestCandles(
  instrument: Instrument,
  granularity: Granularity,
  count = 5
): Promise<OHLCVCandle[]> {
  return fetchCandles(instrument, granularity, count);
}
