import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  fetchStrategies, fetchPositions, fetchTrades, fetchEquitySnapshots,
  fetchRiskEvents, fetchAccountSnapshot, fetchUserSettings,
  updateStrategyStatus, createStrategy, updateStrategyConfig, computePerformanceMetrics
} from '../services/tradingService';
import type { Strategy, Position, Trade, EquitySnapshot, RiskEvent, AccountSummary, PerformanceMetrics } from '../types/trading';

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

  return { trades, loading, refresh: load };
}

export function useEquitySnapshots() {
  const { user } = useAuth();
  const [snapshots, setSnapshots] = useState<EquitySnapshot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    fetchEquitySnapshots(user.id).then(data => {
      setSnapshots(data);
      setLoading(false);
    });
  }, [user]);

  return { snapshots, loading };
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

  return { events, loading, refresh: load };
}

export function useAccountData() {
  const { user } = useAuth();
  const [account, setAccount] = useState<AccountSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    fetchAccountSnapshot(user.id).then(data => {
      setAccount(data);
      setLoading(false);
    });
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
