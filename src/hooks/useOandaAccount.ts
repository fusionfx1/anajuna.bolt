import { useState, useCallback, useEffect } from 'react';
import { oandaService } from '../services/oandaService';
import type { OandaAccount } from '../services/oandaService';
import type { OandaPosition, OandaTrade } from '../types/oanda';
import { upsertOandaPositions, upsertOandaTrades } from '../services/tradingService';
import { useAuth } from '../context/AuthContext';

interface OandaAccountState {
  account: OandaAccount | null;
  positions: OandaPosition[];
  trades: OandaTrade[];
  loading: boolean;
  error: string | null;
  lastRefreshedAt: number | null;
}

export function useOandaAccount() {
  const { user } = useAuth();
  const [state, setState] = useState<OandaAccountState>({
    account: null,
    positions: [],
    trades: [],
    loading: false,
    error: null,
    lastRefreshedAt: null,
  });

  const refresh = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const [account, positions, trades] = await Promise.all([
        oandaService.getAccount(),
        oandaService.getOpenPositions(),
        oandaService.getOpenTrades(),
      ]);

      setState({
        account,
        positions,
        trades,
        loading: false,
        error: null,
        lastRefreshedAt: Date.now(),
      });

      // Persist to Supabase if user is authenticated
      if (user?.id) {
        const accountId = oandaService.getAccountId();
        await Promise.all([
          upsertOandaPositions(user.id, accountId, positions),
          upsertOandaTrades(user.id, accountId, trades),
        ]).catch(() => {
          // Persistence errors are non-critical; UI data is already set
        });
      }
    } catch (err) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to fetch OANDA data',
      }));
    }
  }, [user?.id]);

  // Fetch on mount
  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    ...state,
    refresh,
    isConfigured: oandaService.isConfigured(),
    isPractice: oandaService.isPractice(),
  };
}
