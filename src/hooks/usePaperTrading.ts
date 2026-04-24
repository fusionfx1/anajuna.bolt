import { useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchAccount, fetchOpenTrades,
  openTrade, closeTrade, checkAndAutoClose,
  type OpenTradeParams,
} from '../services/paperTradingService';
import type { PaperAccount, PaperTrade } from '../types/paper';

const AUTOCLOSE_INTERVAL_MS = 3000;

// ── Account hook ──────────────────────────────────────────────────────────────

export function usePaperAccount() {
  const [account, setAccount] = useState<PaperAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchAccount();
      setAccount(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load account');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { account, loading, error, refresh: load };
}

// ── Open positions hook ───────────────────────────────────────────────────────

interface UsePaperPositionsOptions {
  /** Called each time a trade is auto-closed via TP/SL */
  onAutoClose?: (trades: PaperTrade[]) => void;
  getBidAsk?: (instrument: string) => { bid: number; ask: number } | undefined;
}

export function usePaperPositions(opts: UsePaperPositionsOptions = {}) {
  const { onAutoClose, getBidAsk } = opts;
  const [trades,  setTrades]  = useState<PaperTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const optionsRef = useRef(opts);
  optionsRef.current = opts;

  const load = useCallback(async () => {
    try {
      const data = await fetchOpenTrades();
      setTrades(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load positions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // TP/SL auto-close monitor
  useEffect(() => {
    if (!getBidAsk) return;
    const timer = setInterval(async () => {
      const { getBidAsk: getQ, onAutoClose: onAC } = optionsRef.current;
      if (!getQ) return;
      try {
        const current = await fetchOpenTrades();
        const closed  = await checkAndAutoClose(current, getQ);
        if (closed.length > 0) {
          setTrades(prev => prev.filter(t => !closed.some(c => c.id === t.id)));
          onAC?.(closed);
        }
      } catch { /* ignore */ }
    }, AUTOCLOSE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [getBidAsk]);

  const executeOpen = useCallback(async (params: OpenTradeParams): Promise<PaperTrade> => {
    const trade = await openTrade(params);
    setTrades(prev => [trade, ...prev]);
    return trade;
  }, []);

  const executeClose = useCallback(async (trade: PaperTrade, exitPrice: number): Promise<PaperTrade> => {
    const closed = await closeTrade(trade, exitPrice);
    setTrades(prev => prev.filter(t => t.id !== trade.id));
    return closed;
  }, []);

  return { trades, loading, error, refresh: load, executeOpen, executeClose };
}
