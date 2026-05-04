import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  fetchStrategies, fetchPositions, fetchTrades, fetchEquitySnapshots,
  fetchRiskEvents, fetchAccountSnapshot, fetchUserSettings,
  updateStrategyStatus, createStrategy, updateStrategyConfig, computePerformanceMetrics
} from '../services/tradingService';
import type { Strategy, Position, Trade, EquitySnapshot, RiskEvent, AccountSummary, PerformanceMetrics } from '../types/trading';

const isDemo = (userId: string | undefined) => userId === 'demo-user';

export function useStrategies() {
  const { user } = useAuth();
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    if (isDemo(user.id)) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchStrategies(user.id);
      setStrategies(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load strategies');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const toggleStatus = useCallback(async (id: string, newStatus: Strategy['status']) => {
    if (isDemo(user?.id)) {
      setStrategies(prev => prev.map(s => s.id === id ? { ...s, status: newStatus } : s));
      return;
    }
    await updateStrategyStatus(id, newStatus);
    setStrategies(prev => prev.map(s => s.id === id ? { ...s, status: newStatus } : s));
  }, [user]);

  const addStrategy = useCallback(async (userId: string, payload: Parameters<typeof createStrategy>[1]): Promise<void> => {
    if (isDemo(userId)) {
      const mock = {
        total_trades: 0,
        win_rate: 0,
        total_pnl_usd: 0,
        sharpe_ratio: 0,
        updated_at: new Date().toISOString(),
        ...payload,
        id: `demo-${Date.now()}`,
        user_id: userId,
        status: 'active' as const,
        created_at: new Date().toISOString(),
      } as unknown as Strategy;
      setStrategies(prev => [mock, ...prev]);
      return;
    }
    const created = await createStrategy(userId, payload);
    setStrategies(prev => [created, ...prev]);
  }, []);

  const saveConfig = useCallback(async (id: string, updates: Parameters<typeof updateStrategyConfig>[1]) => {
    if (isDemo(user?.id)) {
      setStrategies(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
      return;
    }
    await updateStrategyConfig(id, updates);
    setStrategies(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  }, [user]);

  return { strategies, loading, error, refresh: load, toggleStatus, addStrategy, saveConfig };
}

export function usePositions() {
  const { user } = useAuth();
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPositions(user.id);
      setPositions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load positions');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  return { positions, loading, error, refresh: load };
}

export function useTrades() {
  const { user } = useAuth();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTrades(user.id);
      setTrades(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load trades');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  return { trades, loading, error, refresh: load };
}

export function useEquitySnapshots() {
  const { user } = useAuth();
  const [snapshots, setSnapshots] = useState<EquitySnapshot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    fetchEquitySnapshots(user.id)
      .then(data => setSnapshots(data))
      .catch(() => {/* empty equity curve is acceptable */})
      .finally(() => setLoading(false));
  }, [user]);

  return { snapshots, loading };
}

export function useRiskEvents() {
  const { user } = useAuth();
  const [events, setEvents] = useState<RiskEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchRiskEvents(user.id);
      setEvents(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load risk events');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  return { events, loading, error, refresh: load };
}

export function useAccountData() {
  const { user } = useAuth();
  const [account, setAccount] = useState<AccountSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    fetchAccountSnapshot(user.id)
      .then(data => setAccount(data))
      .catch(() => {/* account may not exist yet */})
      .finally(() => setLoading(false));
  }, [user]);

  return { account, loading };
}

export function usePerformanceMetrics() {
  const { trades } = useTrades();
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);

  useEffect(() => {
    if (trades.length > 0) {
      setMetrics(computePerformanceMetrics(trades));
    }
  }, [trades]);

  return metrics;
}

export function useUserSettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    try {
      const data = await fetchUserSettings(user.id);
      setSettings(data);
    } catch {
      // settings missing is non-fatal — defaults will be used
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  return { settings, loading, refresh: load };
}
