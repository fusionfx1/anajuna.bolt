import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AgentDecision } from '../../types/agentDecision';

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    channel: vi.fn(),
    removeChannel: vi.fn(),
  },
}));

import { supabase } from '../../lib/supabase';
import { useAgentDecisions } from '../useAgentDecisions';

// Cast to any so we can call .mockReturnValue / .mockReturnThis without type errors
const sb = supabase as any; // eslint-disable-line @typescript-eslint/no-explicit-any

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRow(overrides: Partial<AgentDecision> = {}): AgentDecision {
  return {
    id: 'row-1',
    decision_id: 'dec-1',
    user_id: null,
    symbol: 'EURUSD',
    signal_type: 'BUY',
    confidence: 0.9,
    reasoning: 'test reasoning',
    blockers: [],
    contributions: [],
    signal_mode: 'rules',
    created_at: '2026-05-01T00:00:00Z',
    ...overrides,
  };
}

/**
 * Returns a chainable query builder that, when awaited, resolves with
 * `{ data, error }`. This mirrors the Supabase PostgREST filter builder
 * which is a PromiseLike (has a `then` method).
 */
function makeQueryBuilder(
  data: AgentDecision[] | null,
  error: { message: string } | null = null,
) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    // Make the builder awaitable — implements PromiseLike<{ data, error }>
    then(
      onFulfilled: (v: { data: typeof data; error: typeof error }) => unknown,
      onRejected?: (e: unknown) => unknown,
    ) {
      return Promise.resolve({ data, error }).then(onFulfilled, onRejected);
    },
    catch(onRejected: (e: unknown) => unknown) {
      return Promise.resolve({ data, error }).catch(onRejected);
    },
    finally(onFinally: () => void) {
      return Promise.resolve({ data, error }).finally(onFinally);
    },
  };
  return builder;
}

/** Minimal realtime channel stub supporting .on().subscribe() chain. */
function makeChannelStub() {
  return {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useAgentDecisions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sb.channel.mockReturnValue(makeChannelStub());
    sb.removeChannel.mockReturnValue(undefined);
  });

  it('Test 1: returns rows with user_id=null (RLS-03 empty-feed contract)', async () => {
    // The SELECT RLS policy allows both auth.uid()=user_id AND user_id IS NULL.
    // This test asserts the hook surfaces null-user rows unchanged.
    const row = makeRow({ user_id: null });
    sb.from.mockReturnValue(makeQueryBuilder([row]));

    const { result } = renderHook(() => useAgentDecisions());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.decisions).toHaveLength(1);
    expect(result.current.decisions[0].user_id).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('Test 2: returns rows with own user_id', async () => {
    const row = makeRow({
      id: 'row-2',
      decision_id: 'dec-2',
      user_id: 'user-abc',
      symbol: 'GBPUSD',
      signal_type: 'SELL',
    });
    sb.from.mockReturnValue(makeQueryBuilder([row]));

    const { result } = renderHook(() => useAgentDecisions());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.decisions).toHaveLength(1);
    expect(result.current.decisions[0].user_id).toBe('user-abc');
    expect(result.current.error).toBeNull();
  });

  it('Test 3: symbolFilter option is applied as .eq("symbol", value) on the query', async () => {
    const builder = makeQueryBuilder([makeRow()]);
    sb.from.mockReturnValue(builder);

    const { result } = renderHook(() => useAgentDecisions({ symbolFilter: 'EURUSD' }));

    await waitFor(() => expect(result.current.loading).toBe(false));

    // The hook must call .eq('symbol', symbolFilter) exactly once when the filter is set
    expect(builder.eq).toHaveBeenCalledWith('symbol', 'EURUSD');
    expect(builder.eq).toHaveBeenCalledTimes(1);
  });

  it('Test 4: Supabase query error surfaces as hook.error, not silent empty', async () => {
    // When Supabase returns { data: null, error }, the hook throws and sets error state.
    // This guards against silent failures that would look like an empty feed.
    sb.from.mockReturnValue(makeQueryBuilder(null, { message: 'DB failure' }));

    const { result } = renderHook(() => useAgentDecisions());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).not.toBeNull();
    expect(result.current.decisions).toHaveLength(0);
  });

  it('Test 5: regression — user_id=null rows are NOT filtered out client-side', async () => {
    // Guards against any accidental client-side filter on user_id that would
    // break the empty-feed for public/system signals (user_id IS NULL rows).
    const nullRow = makeRow({ id: 'row-null', user_id: null });
    const ownRow = makeRow({
      id: 'row-own',
      decision_id: 'dec-2',
      user_id: 'user-abc',
      symbol: 'GBPUSD',
    });
    sb.from.mockReturnValue(makeQueryBuilder([nullRow, ownRow]));

    const { result } = renderHook(() => useAgentDecisions());

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Both rows must survive — no client-side user_id filter
    expect(result.current.decisions).toHaveLength(2);
    const nullRows = result.current.decisions.filter(d => d.user_id === null);
    expect(nullRows).toHaveLength(1);
  });
});
