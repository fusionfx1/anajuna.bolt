import { useState, useEffect, useCallback, useRef } from 'react';
import type { Tick, ConnectionStats, OHLCVBar, DataFeedConfig, OrderBook, OrderBookLevel } from '../types/dataFeed';
import { dataFeedService } from '../services/dataFeedService';
import type { MarketQuote } from '../types/trading';

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
