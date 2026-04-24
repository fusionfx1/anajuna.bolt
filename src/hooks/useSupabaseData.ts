import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import {
  fetchStrategies, fetchPositions, fetchTrades, fetchEquitySnapshots,
  fetchRiskEvents, fetchAccountSnapshot, fetchUserSettings,
  updateStrategyStatus, createStrategy, updateStrategyConfig, computePerformanceMetrics
} from '../services/tradingService';
import type { Strategy, Position, Trade, EquitySnapshot, RiskEvent, AccountSummary, PerformanceMetrics } from '../types/trading';

const EQUITY_POLL_INTERVAL_MS = 30_000;

export function useStrategies() {
  const { user } = useAuth();
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await fetchStrategies(user.id);
      setStrategies(data);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  // Realtime: re-fetch whenever any strategy row changes for this user
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('strategies-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'strategies', filter: `user_id=eq.${user.id}` },
        () => { load(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, load]);

  const toggleStatus = useCallback(async (id: string, newStatus: Strategy['status']) => {
    await updateStrategyStatus(id, newStatus);
    setStrategies(prev => prev.map(s => s.id === id ? { ...s, status: newStatus } : s));
  }, []);

  const addStrategy = useCallback(async (userId: string, payload: Parameters<typeof createStrategy>[1]) => {
    const created = await createStrategy(userId, payload);
    setStrategies(prev => [created, ...prev]);
  }, []);

  const saveConfig = useCallback(async (id: string, updates: Parameters<typeof updateStrategyConfig>[1]) => {
    await updateStrategyConfig(id, updates);
    setStrategies(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  }, []);

  return { strategies, loading, refresh: load, toggleStatus, addStrategy, saveConfig };
}

export function usePositions() {
  const { user } = useAuth();
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await fetchPositions(user.id);
      setPositions(data);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  // Realtime: update positions table live
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('positions-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'positions', filter: `user_id=eq.${user.id}` },
        () => { load(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, load]);

  return { positions, loading, refresh: load };
}

export function useTrades() {
  const { user } = useAuth();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await fetchTrades(user.id);
      setTrades(data);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  // Realtime: new trades appear instantly in trade history
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('trades-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'trades', filter: `user_id=eq.${user.id}` },
        () => { load(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, load]);

  return { trades, loading, refresh: load };
}

export function useEquitySnapshots() {
  const { user } = useAuth();
  const [snapshots, setSnapshots] = useState<EquitySnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const data = await fetchEquitySnapshots(user.id);
      setSnapshots(data);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  // Poll every 30 seconds so the equity curve stays current without requiring manual refresh
  useEffect(() => {
    if (!user) return;
    pollRef.current = setInterval(load, EQUITY_POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [user, load]);

  // Realtime: new snapshots written by the order flow appear immediately
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('equity-snapshots-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'equity_snapshots', filter: `user_id=eq.${user.id}` },
        () => { load(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, load]);

  return { snapshots, loading, refresh: load };
}

export function useRiskEvents() {
  const { user } = useAuth();
  const [events, setEvents] = useState<RiskEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await fetchRiskEvents(user.id);
      setEvents(data);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  // Realtime: risk events surface immediately on the dashboard
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('risk-events-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'risk_events', filter: `user_id=eq.${user.id}` },
        () => { load(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, load]);

  return { events, loading, refresh: load };
}

export function useAccountData() {
  const { user } = useAuth();
  const [account, setAccount] = useState<AccountSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const data = await fetchAccountSnapshot(user.id);
      setAccount(data);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  // Poll account snapshot every 30 seconds to keep balance/equity current
  useEffect(() => {
    if (!user) return;
    pollRef.current = setInterval(load, EQUITY_POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [user, load]);

  return { account, loading, refresh: load };
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
    if (!user) return;
    setLoading(true);
    try {
      const data = await fetchUserSettings(user.id);
      setSettings(data);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  return { settings, loading, refresh: load };
}
