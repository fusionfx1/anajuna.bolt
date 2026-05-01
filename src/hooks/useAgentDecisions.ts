import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { AgentDecision, AgentContribution } from '../types/agentDecision';

function toArray<T>(val: unknown): T[] {
  return Array.isArray(val) ? (val as T[]) : [];
}

function normalizeRow(row: Record<string, unknown>): AgentDecision {
  return {
    id: row.id as string,
    decision_id: row.decision_id as string,
    user_id: (row.user_id as string | null) ?? null,
    symbol: row.symbol as string,
    signal_type: row.signal_type as AgentDecision['signal_type'],
    confidence: Number(row.confidence),
    reasoning: (row.reasoning as string) ?? '',
    blockers: toArray<string>(row.blockers),
    contributions: toArray<AgentContribution>(row.contributions),
    signal_mode: (row.signal_mode as string) ?? '',
    created_at: row.created_at as string,
  };
}

export interface UseAgentDecisionsOptions {
  symbolFilter?: string;
}

export interface UseAgentDecisionsResult {
  decisions: AgentDecision[];
  loading: boolean;
  connected: boolean;
  error: string | null;
  lastUpdated: Date | null;
  isStale: boolean;
}

export function useAgentDecisions(
  options: UseAgentDecisionsOptions = {}
): UseAgentDecisionsResult {
  const { symbolFilter } = options;

  const [decisions, setDecisions] = useState<AgentDecision[]>([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const STALE_THRESHOLD_MS = 60_000;
  const isStale = lastUpdated !== null && Date.now() - lastUpdated.getTime() > STALE_THRESHOLD_MS;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const run = async () => {
      try {
        // RLS policy handles row filtering — SELECT allows auth.uid()=user_id OR user_id IS NULL.
        let query = supabase
          .from('agent_decisions')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100);
        if (symbolFilter) query = query.eq('symbol', symbolFilter);

        const { data, error: queryError } = await query;
        if (cancelled) return;
        if (queryError) throw queryError;
        setDecisions((data ?? []).map(row => normalizeRow(row as Record<string, unknown>)));
        if (!cancelled) setLastUpdated(new Date());
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load agent decisions');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => { cancelled = true; };
  }, [symbolFilter]);

  useEffect(() => {

    const channel = supabase
      .channel('agent-decisions-feed')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'agent_decisions',
          // No explicit channel filter needed — Supabase Realtime respects the SELECT RLS policy.
        },
        (payload) => {
          const newRow = normalizeRow(payload.new as Record<string, unknown>);
          if (symbolFilter && newRow.symbol !== symbolFilter) return;
          setDecisions(prev => [newRow, ...prev].slice(0, 100));
          setLastUpdated(new Date());
        }
      )
      .subscribe((status) => {
        setConnected(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [symbolFilter]);

  return { decisions, loading, connected, error, lastUpdated, isStale };
}
