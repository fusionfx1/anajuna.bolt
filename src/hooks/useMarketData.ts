import { useState, useCallback, useRef, useEffect } from 'react';
import type { MarketQuote, AccountSummary } from '../types/trading';
import { FOREX_SYMBOLS, INITIAL_MARKET_PRICES } from '../lib/constants';
import { dataFeedService } from '../services/dataFeedService';

function buildInitialQuotes(symbols: string[]): MarketQuote[] {
  return symbols.map(symbol => {
    const mid = INITIAL_MARKET_PRICES[symbol] ?? 1.0;
    const isJpy = symbol.includes('JPY') || symbol === 'XAUUSD';
    const spreadPips = isJpy ? 0.8 : 1.2;
    const pipSize = isJpy ? 0.01 : 0.0001;
    const half = (spreadPips * pipSize) / 2;
    const bid = parseFloat((mid - half).toFixed(isJpy ? 3 : 5));
    const ask = parseFloat((mid + half).toFixed(isJpy ? 3 : 5));
    return {
      symbol,
      bid,
      ask,
      spread: spreadPips,
      change_pct: 0,
      high_24h: parseFloat((mid * 1.003).toFixed(isJpy ? 3 : 5)),
      low_24h: parseFloat((mid * 0.997).toFixed(isJpy ? 3 : 5)),
      volume: 80000 + Math.floor(symbol.charCodeAt(0) * 1200),
      timestamp: Date.now(),
    };
  });
}

function tickQuote(q: MarketQuote): MarketQuote {
  const isJpy = q.symbol.includes('JPY') || q.symbol === 'XAUUSD';
  const pipSize = isJpy ? 0.001 : 0.00001;
  const maxMove = pipSize * 2;
  const seed = (Date.now() % 997) / 997;
  const direction = seed > 0.5 ? 1 : -1;
  const magnitude = (seed % 0.5) * 2;
  const delta = direction * magnitude * maxMove;
  const dp = isJpy ? 3 : 5;
  const newBid = parseFloat((q.bid + delta).toFixed(dp));
  const spreadPips = q.spread;
  const newAsk = parseFloat((newBid + spreadPips * pipSize * 10).toFixed(dp));
  const changeDelta = delta / (INITIAL_MARKET_PRICES[q.symbol] ?? 1) * 100;
  const newChangePct = parseFloat((q.change_pct + changeDelta).toFixed(2));
  return {
    ...q,
    bid: newBid,
    ask: newAsk,
    change_pct: Math.max(-5, Math.min(5, newChangePct)),
    timestamp: Date.now(),
  };
}

export function useMarketData(intervalMs = 800) {
  const [quotes, setQuotes] = useState<MarketQuote[]>(() => buildInitialQuotes(FOREX_SYMBOLS));
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Track which symbols are being driven by a live feed so we skip simulation ticks for them
  const liveSymbols = useRef<Set<string>>(new Set());

  // Subscribe to dataFeedService ticks — applies when OANDA streaming or Polygon/Alpaca is active
  useEffect(() => {
    const unsub = dataFeedService.onTick(tick => {
      liveSymbols.current.add(tick.symbol);
      setQuotes(prev => prev.map(q => {
        if (q.symbol !== tick.symbol) return q;
        const isJpy = q.symbol.includes('JPY') || q.symbol === 'XAUUSD';
        const dp = isJpy ? 3 : 5;
        const mid = (tick.bid + tick.ask) / 2;
        const basePrice = INITIAL_MARKET_PRICES[q.symbol] ?? mid;
        const changeDelta = ((mid - basePrice) / basePrice) * 100;
        return {
          ...q,
          bid: parseFloat(tick.bid.toFixed(dp)),
          ask: parseFloat(tick.ask.toFixed(dp)),
          spread: parseFloat(((tick.ask - tick.bid) / (isJpy ? 0.001 : 0.00001)).toFixed(1)),
          change_pct: Math.max(-5, Math.min(5, parseFloat(changeDelta.toFixed(2)))),
          high_24h: Math.max(q.high_24h, tick.ask),
          low_24h: Math.min(q.low_24h, tick.bid),
          timestamp: tick.timestamp,
        };
      }));
    });
    return unsub;
  }, []);

  // Fallback simulation ticker — only fires for symbols not driven by a live feed
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setQuotes(prev => prev.map((q, idx) => {
        // If a real tick arrived for this symbol recently, skip simulation
        if (liveSymbols.current.has(q.symbol)) return q;
        const phase = (Date.now() + idx * 137) % 3;
        if (phase === 0) return q;
        return tickQuote(q);
      }));
    }, intervalMs);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [intervalMs]);

  const getQuote = useCallback((symbol: string) => {
    return quotes.find(q => q.symbol === symbol);
  }, [quotes]);

  return { quotes, getQuote };
}

const EMPTY_ACCOUNT: AccountSummary = {
  balance: 0,
  equity: 0,
  margin_used: 0,
  free_margin: 0,
  margin_level_pct: 0,
  open_pnl: 0,
  daily_pnl: 0,
  daily_pnl_pct: 0,
  drawdown_pct: 0,
  peak_balance: 0,
};

export function useAccountSummary() {
  const [account] = useState<AccountSummary>(EMPTY_ACCOUNT);
  return account;
}
