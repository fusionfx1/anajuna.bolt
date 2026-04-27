import { useState, useEffect, useCallback, useRef } from 'react';
import type { Tick, ConnectionStats, OHLCVBar, DataFeedConfig, OrderBook, OrderBookLevel } from '../types/dataFeed';
import { dataFeedService } from '../services/dataFeedService';
import type { MarketQuote } from '../types/trading';
import { buildInitialQuotes } from './useMarketData';
import { FOREX_SYMBOLS } from '../lib/constants';

export function useFeedStatus() {
  const [stats, setStats] = useState<ConnectionStats>(() => dataFeedService.getStats());

  useEffect(() => {
    const unsub = dataFeedService.onStatus(setStats);
    return unsub;
  }, []);

  return stats;
}

export function useDataFeedConnection(config: DataFeedConfig | null) {
  const stats = useFeedStatus();

  useEffect(() => {
    if (!config) return;
    dataFeedService.connect(config);
  }, [config]);

  const disconnect = useCallback(() => dataFeedService.disconnect(), []);

  return { stats, disconnect };
}

export function useLiveTicks(symbols: string[], maxPerSymbol = 50) {
  const [ticks, setTicks] = useState<Map<string, Tick[]>>(new Map());
  const [latestTick, setLatestTick] = useState<Tick | null>(null);

  useEffect(() => {
    const unsub = dataFeedService.onTick((tick) => {
      if (symbols.length > 0 && !symbols.includes(tick.symbol)) return;

      setLatestTick(tick);
      setTicks(prev => {
        const next = new Map(prev);
        const existing = next.get(tick.symbol) ?? [];
        const updated = [tick, ...existing].slice(0, maxPerSymbol);
        next.set(tick.symbol, updated);
        return next;
      });
    });

    return unsub;
  }, [symbols, maxPerSymbol]);

  const getTicksForSymbol = useCallback((symbol: string) => {
    return ticks.get(symbol) ?? [];
  }, [ticks]);

  return { ticks, latestTick, getTicksForSymbol };
}

export function useLiveQuotes(symbols: string[]) {
  const [quotes, setQuotes] = useState<Map<string, MarketQuote>>(new Map());

  useEffect(() => {
    const unsub = dataFeedService.onTick((tick) => {
      if (symbols.length > 0 && !symbols.includes(tick.symbol)) return;

      setQuotes(prev => {
        const existing = prev.get(tick.symbol);
        if (!existing) return prev;

        const next = new Map(prev);
        next.set(tick.symbol, {
          ...existing,
          bid: tick.bid,
          ask: tick.ask,
          spread: parseFloat(((tick.ask - tick.bid) * (tick.symbol.includes('JPY') ? 1000 : 100000)).toFixed(1)),
          timestamp: tick.timestamp,
        });
        return next;
      });
    });

    return unsub;
  }, [symbols]);

  const getQuote = useCallback((symbol: string) => quotes.get(symbol), [quotes]);
  const allQuotes = Array.from(quotes.values());

  return { quotes: allQuotes, getQuote };
}

/**
 * Production market quote hook — sources bid/ask from the live data feed
 * (Polygon / Alpaca / OANDA / simulation fallback) and exposes the same
 * `{ quotes, getQuote }` shape that the legacy simulated hook provided.
 *
 * Quotes are seeded from `INITIAL_MARKET_PRICES` so the table renders
 * immediately while the feed connects. Each incoming tick patches the
 * matching symbol with fresh bid/ask/spread/timestamp and an updated
 * change_pct relative to the seed price.
 */
export function useLiveMarketData(symbols: string[] = FOREX_SYMBOLS) {
  const [quotes, setQuotes] = useState<MarketQuote[]>(() => buildInitialQuotes(symbols));
  const seedRef = useRef<Map<string, number>>(
    new Map(buildInitialQuotes(symbols).map(q => [q.symbol, (q.bid + q.ask) / 2])),
  );

  useEffect(() => {
    setQuotes(buildInitialQuotes(symbols));
    seedRef.current = new Map(
      buildInitialQuotes(symbols).map(q => [q.symbol, (q.bid + q.ask) / 2]),
    );
  }, [symbols.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const unsub = dataFeedService.onTick(tick => {
      if (symbols.length > 0 && !symbols.includes(tick.symbol)) return;
      const isJpy = tick.symbol.includes('JPY') || tick.symbol === 'XAUUSD';
      const dp = isJpy ? 3 : 5;
      const pipMultiplier = isJpy ? 100 : 10000;
      const seed = seedRef.current.get(tick.symbol);
      const changePct = seed && seed > 0
        ? parseFloat((((tick.bid + tick.ask) / 2 - seed) / seed * 100).toFixed(3))
        : 0;

      setQuotes(prev => {
        const idx = prev.findIndex(q => q.symbol === tick.symbol);
        const next = [...prev];
        const spreadPips = parseFloat(((tick.ask - tick.bid) * pipMultiplier).toFixed(2));
        const bid = parseFloat(tick.bid.toFixed(dp));
        const ask = parseFloat(tick.ask.toFixed(dp));

        if (idx === -1) {
          next.push({
            symbol: tick.symbol,
            bid,
            ask,
            spread: spreadPips,
            change_pct: 0,
            high_24h: bid,
            low_24h: bid,
            volume: tick.size,
            timestamp: tick.timestamp,
          });
          return next;
        }

        const existing = next[idx];
        next[idx] = {
          ...existing,
          bid,
          ask,
          spread: spreadPips,
          change_pct: changePct,
          high_24h: Math.max(existing.high_24h, bid),
          low_24h: existing.low_24h > 0 ? Math.min(existing.low_24h, bid) : bid,
          volume: existing.volume + tick.size,
          timestamp: tick.timestamp,
        };
        return next;
      });
    });
    return unsub;
  }, [symbols.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const getQuote = useCallback(
    (symbol: string) => quotes.find(q => q.symbol === symbol),
    [quotes],
  );

  return { quotes, getQuote };
}

export function useLiveBars(symbol: string, maxBars = 60) {
  const [bars, setBars] = useState<OHLCVBar[]>([]);

  useEffect(() => {
    const unsub = dataFeedService.onTick((tick) => {
      if (tick.symbol !== symbol) return;
      const closedBar = dataFeedService.aggregateTick(tick);
      if (closedBar) {
        setBars(prev => [...prev, closedBar].slice(-maxBars));
      }
    });

    return unsub;
  }, [symbol, maxBars]);

  return bars;
}

export function useSimulatedOrderBook(symbol: string) {
  const baseRef = useRef<{ bid: number; ask: number } | null>(null);
  const [book, setBook] = useState<OrderBook>(() => generateBook(symbol, null));

  useEffect(() => {
    const unsub = dataFeedService.onTick((tick) => {
      if (tick.symbol !== symbol) return;
      baseRef.current = { bid: tick.bid, ask: tick.ask };
      setBook(generateBook(symbol, baseRef.current));
    });

    return unsub;
  }, [symbol]);

  return book;
}

function generateBook(symbol: string, base: { bid: number; ask: number } | null): OrderBook {
  const isJpy = symbol.includes('JPY');
  const pipSize = isJpy ? 0.001 : 0.00001;
  const mid = base ? (base.bid + base.ask) / 2 : (isJpy ? 110.0 : 1.1000);

  const bids: OrderBookLevel[] = Array.from({ length: 10 }, (_, i) => ({
    price: parseFloat((mid - pipSize * (i + 1) * 2).toFixed(isJpy ? 3 : 5)),
    size: Math.floor(Math.random() * 5000000) + 500000,
    count: Math.floor(Math.random() * 20) + 1,
  }));

  const asks: OrderBookLevel[] = Array.from({ length: 10 }, (_, i) => ({
    price: parseFloat((mid + pipSize * (i + 1) * 2).toFixed(isJpy ? 3 : 5)),
    size: Math.floor(Math.random() * 5000000) + 500000,
    count: Math.floor(Math.random() * 20) + 1,
  }));

  return { symbol, bids, asks, timestamp: Date.now() };
}
