import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  fetchAIProviders, fetchAIPredictions, callAISignal, savePrediction, testAIConnection
} from '../services/aiProviderService';
import type { AIProviderConfig, AIPrediction, AISignalRequest, AISignalResponse } from '../types/aiProvider';

export function useAIProviders() {
  const { user } = useAuth();
  const [providers, setProviders] = useState<AIProviderConfig[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await fetchAIProviders(user.id);
      setProviders(data);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  return { providers, loading, refresh: load, setProviders };
}

export function useAIPredictions(limit = 50) {
  const { user } = useAuth();
  const [predictions, setPredictions] = useState<AIPrediction[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await fetchAIPredictions(user.id, limit);
      setPredictions(data);
    } finally {
      setLoading(false);
    }
  }, [user, limit]);

  useEffect(() => { load(); }, [load]);

  return { predictions, loading, refresh: load };
}

export interface AIEngineState {
  isRunning: boolean;
  activeProvider: AIProviderConfig | null;
  lastSignals: Map<string, { signal: AISignalResponse; timestamp: number }>;
  signalCount: number;
  errorCount: number;
  avgLatencyMs: number;
}

export function useAIEngine(pollIntervalMs = 30000) {
  const { user } = useAuth();
  const { providers } = useAIProviders();

  const [state, setState] = useState<AIEngineState>({
    isRunning: false,
    activeProvider: null,
    lastSignals: new Map(),
    signalCount: 0,
    errorCount: 0,
    avgLatencyMs: 0,
  });

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const latenciesRef = useRef<number[]>([]);

  const activeProvider = providers.find(p => p.is_active && p.roles.includes('signal_generation')) ?? null;

  const requestSignal = useCallback(async (
    request: AISignalRequest,
    strategyId?: string
  ): Promise<AISignalResponse | null> => {
    if (!activeProvider || !user) return null;

    try {
      const result = await callAISignal(activeProvider.id, request);

      latenciesRef.current = [...latenciesRef.current.slice(-19), result.latency_ms];
      const avgLatency = latenciesRef.current.reduce((a, b) => a + b, 0) / latenciesRef.current.length;

      setState(prev => {
        const next = new Map(prev.lastSignals);
        next.set(request.symbol, { signal: result, timestamp: Date.now() });
        return {
          ...prev,
          lastSignals: next,
          signalCount: prev.signalCount + 1,
          avgLatencyMs: Math.round(avgLatency),
        };
      });

      await savePrediction(user.id, {
        provider_id: activeProvider.id,
        strategy_id: strategyId ?? null,
        symbol: request.symbol,
        signal: result.signal,
        confidence: result.confidence,
        reasoning: result.reasoning,
        price_at_signal: request.candles.at(-1)?.close ?? 0,
        indicators_snapshot: request.indicators,
        model_name: activeProvider.model_name,
        latency_ms: result.latency_ms,
      });

      return result;
    } catch {
      setState(prev => ({ ...prev, errorCount: prev.errorCount + 1 }));
      return null;
    }
  }, [activeProvider, user]);

  const start = useCallback(() => {
    if (!activeProvider) return;
    setState(prev => ({ ...prev, isRunning: true, activeProvider }));
  }, [activeProvider]);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setState(prev => ({ ...prev, isRunning: false }));
  }, []);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const testProvider = useCallback(async (providerId: string) => {
    return testAIConnection(providerId);
  }, []);

  return {
    state,
    activeProvider,
    requestSignal,
    start,
    stop,
    testProvider,
    pollIntervalMs,
  };
}
