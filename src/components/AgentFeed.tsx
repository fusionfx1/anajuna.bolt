import { useState, Fragment } from 'react';
import { Zap, Loader2, AlertCircle, Activity } from 'lucide-react';
import { useAgentDecisions } from '../hooks/useAgentDecisions';
import type { AgentContribution, AgentDecision } from '../types/agentDecision';

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────

const SIG_COLORS = {
  BUY:  { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', bar: 'bg-emerald-500' },
  SELL: { text: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/20',     bar: 'bg-red-500'     },
  HOLD: { text: 'text-slate-400',   bg: 'bg-slate-700/50',   border: 'border-slate-600',      bar: 'bg-slate-600'   },
} as const;

const AGENT_LABELS: Record<string, string> = {
  news: 'News', fred: 'FRED', sentiment: 'Sentiment', technical: 'Technical',
};
const AGENT_ABBR: Record<string, string> = {
  news: 'N', fred: 'F', sentiment: 'S', technical: 'T',
};

const BLOCKER_COLORS: Record<string, string> = {
  CIRCUIT_BREAKER:    'bg-red-500/10 text-red-400 border-red-500/20',
  budget_exceeded:    'bg-amber-500/10 text-amber-400 border-amber-500/20',
  all_agents_errored: 'bg-red-500/10 text-red-400 border-red-500/20',
  conflicting_signals:'bg-violet-500/10 text-violet-400 border-violet-500/20',
};

const PROVIDER_LABELS: Record<string, string> = {
  news:      'NewsAPI · OpenAI',
  fred:      'FRED API',
  sentiment: 'Finnhub · Twitter',
  technical: 'Rule Engine',
};

type SignalFilter = '' | 'BUY' | 'SELL' | 'HOLD';

function sigColors(sig: 'BUY' | 'SELL' | 'HOLD') {
  return SIG_COLORS[sig] ?? SIG_COLORS.HOLD;
}

function shortId(uuid: string): string {
  return uuid.slice(0, 8);
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-GB', {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  } catch {
    return iso;
  }
}

// ─── BLOCKER BADGE ────────────────────────────────────────────────────────────

function BlockerBadge({ blocker }: { blocker: string }) {
  const cls = BLOCKER_COLORS[blocker] ?? 'bg-slate-700/50 text-slate-400 border-slate-600';
  return (
    <span className={`inline-flex items-center text-[10px] font-mono px-1.5 py-0.5 rounded border ${cls}`}>
      {blocker}
    </span>
  );
}

// ─── AGENT VOTE CARD ──────────────────────────────────────────────────────────

function AgentVoteCard({ contrib }: { contrib: AgentContribution }) {
  const c = sigColors(contrib.signal_type);
  const pct = Math.round(contrib.confidence * 100);
  const isErr  = contrib.status === 'error';
  const isWarn = contrib.status === 'warning';

  return (
    <div className={`rounded-xl p-3 border transition-all ${
      isErr ? 'bg-slate-900/60 border-slate-800 opacity-60' : 'bg-white/[.025] border-white/[.06] hover:bg-white/[.04]'
    }`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          {AGENT_LABELS[contrib.source] ?? contrib.source}
        </span>
        <span className={`font-mono text-[10px] ${c.text}`}>{pct}%</span>
      </div>

      <span className={`inline-block text-[11px] font-mono font-semibold px-2 py-0.5 rounded-lg mb-2.5 border ${c.text} ${c.bg} ${c.border}`}>
        {isErr ? <s className="opacity-40">{contrib.signal_type}</s> : contrib.signal_type}
      </span>

      <div className="h-px rounded-full overflow-hidden mb-2.5 bg-white/[.06]">
        <div className={`h-full rounded-full opacity-70 ${c.bar}`} style={{ width: `${pct}%` }} />
      </div>

      <p className="mb-2.5 text-slate-500 text-[11px] leading-relaxed line-clamp-2">
        {contrib.reasoning}
      </p>

      <div className="flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
          isErr ? 'bg-red-500' : isWarn ? 'bg-amber-500' : 'bg-emerald-500'
        }`} />
        <span className="font-mono text-[10px] text-slate-700">{contrib.latency_ms}ms</span>
      </div>
    </div>
  );
}

// ─── DECISION HERO CARD ───────────────────────────────────────────────────────

function DecisionHeroCard({ decision }: { decision: AgentDecision | null }) {
  if (!decision) {
    return (
      <div className="bg-white/[.015] border border-white/[.06] rounded-2xl p-8 flex flex-col items-center justify-center min-h-[280px]">
        <div className="w-12 h-12 rounded-2xl bg-violet-500/10 flex items-center justify-center mb-4">
          <Zap size={20} className="text-violet-400" />
        </div>
        <p className="text-sm font-semibold text-slate-500 mb-1">No decisions yet</p>
        <p className="text-xs text-slate-700 text-center">
          Start <code className="font-mono bg-white/[.05] px-1.5 py-0.5 rounded text-[10px]">run_live</code> with{' '}
          <code className="font-mono bg-white/[.05] px-1.5 py-0.5 rounded text-[10px]">SIGNAL_MODE=agent</code>
        </p>
      </div>
    );
  }

  const c = sigColors(decision.signal_type);
  const pct = Math.round(decision.confidence * 100);

  return (
    <div className="bg-white/[.015] border border-violet-500/20 rounded-2xl p-5"
      style={{ boxShadow: '0 0 24px rgba(124,58,237,.15), 0 0 1px rgba(124,58,237,.3)' }}>
      {/* Top row */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-[10px] font-semibold tracking-widest uppercase text-slate-600">Latest Decision</span>
            <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20">
              {shortId(decision.decision_id)}
            </span>
            <span className="font-mono text-[10px] text-slate-600">{fmtTime(decision.created_at)}</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <span className={`font-mono font-bold text-3xl ${c.text}`}>{decision.signal_type}</span>
            <span className="font-mono font-semibold text-sm text-white">{decision.symbol}</span>
            {decision.blockers.map(b => <BlockerBadge key={b} blocker={b} />)}
          </div>
        </div>

        {/* Confidence circle */}
        <div className="flex flex-col items-center gap-1 flex-shrink-0">
          <div className="relative w-[72px] h-[72px]">
            <svg viewBox="0 0 72 72" className="w-full h-full -rotate-90">
              <circle cx="36" cy="36" r="30" fill="none" stroke="rgba(255,255,255,.06)" strokeWidth="6" />
              <circle
                cx="36" cy="36" r="30" fill="none"
                stroke={decision.signal_type === 'BUY' ? '#10b981' : decision.signal_type === 'SELL' ? '#ef4444' : '#64748b'}
                strokeWidth="6"
                strokeDasharray={`${pct * 1.885} 188.5`}
                strokeLinecap="round"
                className="transition-all duration-700"
              />
            </svg>
            <span className={`absolute inset-0 flex items-center justify-center font-mono font-bold text-sm ${c.text}`}>
              {pct}
            </span>
          </div>
          <span className="text-[10px] text-slate-600">confidence</span>
        </div>
      </div>

      {/* Thin confidence bar */}
      <div className="h-px rounded-full overflow-hidden mb-5 bg-white/[.04]">
        <div className={`h-full rounded-full transition-all duration-700 ${c.bar}`} style={{ width: `${pct}%`, opacity: 0.7 }} />
      </div>

      {/* Agent votes */}
      <p className="text-[10px] font-semibold tracking-widest uppercase text-slate-600 mb-3">Agent Votes</p>
      <div className="grid grid-cols-4 gap-3">
        {decision.contributions.map(contrib => (
          <AgentVoteCard key={contrib.source} contrib={contrib} />
        ))}
      </div>

      {/* Reasoning */}
      <div className="mt-4 rounded-xl px-4 py-3 bg-slate-800/40 border border-white/[.04]">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-600 mb-1.5">Reasoning</p>
        <p className="text-xs text-slate-500 leading-relaxed">{decision.reasoning}</p>
      </div>
    </div>
  );
}

// ─── AGENT HEALTH ROW ─────────────────────────────────────────────────────────

function AgentHealthCard({ contrib }: { contrib: AgentContribution }) {
  const isErr  = contrib.status === 'error';
  const isWarn = contrib.status === 'warning';

  const statusLabel = isErr ? 'TIMEOUT' : 'LIVE';
  const statusColor = isErr ? 'text-red-400' : 'text-emerald-400';
  const dotColor    = isErr ? 'bg-red-500'   : 'bg-emerald-500';

  const health = isErr ? 0 : isWarn ? 72 : Math.min(97, 85 + (contrib.latency_ms % 12));
  const barColor = health > 80 ? 'bg-emerald-500' : health > 50 ? 'bg-amber-500' : 'bg-red-500';
  const healthColor = health > 80 ? 'text-emerald-400' : health > 50 ? 'text-amber-400' : 'text-red-400';

  return (
    <div className="bg-white/[.015] border border-white/[.05] rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full ${dotColor} ${isErr ? '' : 'animate-pulse'}`} />
          <span className={`text-[10px] font-bold tracking-wide ${statusColor}`}>{statusLabel}</span>
        </div>
        <span className="font-mono text-[10px] text-slate-600">{contrib.latency_ms}ms</span>
      </div>
      <p className="text-sm font-semibold text-white mb-0.5">
        {AGENT_LABELS[contrib.source] ?? contrib.source}
      </p>
      <p className="text-[10px] text-slate-600 mb-3">
        {PROVIDER_LABELS[contrib.source] ?? contrib.source}
      </p>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-slate-600">health</span>
        <span
          className={`font-mono text-[10px] font-semibold ${healthColor}`}
          title="Latency-based estimate — not a live health signal"
        >
          {health}% <span className="text-slate-700 font-normal">(est.)</span>
        </span>
      </div>
      <div className="h-0.5 rounded-full overflow-hidden bg-white/[.06]">
        <div className={`h-full rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${health}%` }} />
      </div>
    </div>
  );
}

function AgentHealthRow({ decision }: { decision: AgentDecision | null }) {
  if (!decision) return null;

  return (
    <div>
      <p className="text-[10px] font-bold tracking-widest uppercase text-slate-700 mb-3">Agent Health</p>
      <div className="grid grid-cols-4 gap-3">
        {decision.contributions.map(contrib => (
          <AgentHealthCard key={contrib.source} contrib={contrib} />
        ))}
      </div>
    </div>
  );
}

// ─── DECISION TABLE ───────────────────────────────────────────────────────────

function VoteChip({ contrib }: { contrib: AgentContribution }) {
  const c = sigColors(contrib.signal_type);
  const isErr = contrib.status === 'error' || contrib.status === 'warning';
  const ltr = AGENT_ABBR[contrib.source] ?? (contrib.source?.[0]?.toUpperCase() ?? '?');

  return (
    <span
      title={`${contrib.source}: ${contrib.signal_type} (${Math.round(contrib.confidence * 100)}%)`}
      className={`text-[10px] font-mono font-bold w-5 h-5 inline-flex items-center justify-center rounded border transition-colors ${
        isErr
          ? 'text-slate-600 bg-white/[.03] border-white/[.04] line-through opacity-50'
          : `${c.text} ${c.bg} ${c.border}`
      }`}
    >
      {ltr}
    </span>
  );
}

function DecisionTable({ decisions }: { decisions: AgentDecision[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggleRow(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="bg-white/[.015] border border-white/[.06] rounded-2xl overflow-hidden">
      <div className="px-5 py-3 border-b border-white/[.05] flex items-center justify-between">
        <span className="text-sm font-semibold text-white">Decision History</span>
        <div className="flex items-center gap-3">
          {decisions.length > 0 && (
            <span className="font-mono text-xs text-slate-600">{decisions.length} decisions</span>
          )}
          <div className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] bg-violet-500/10 text-violet-400">
            <Activity size={10} />
            Click row to expand
          </div>
        </div>
      </div>

      {decisions.length === 0 ? (
        <div className="py-16 text-center">
          <div className="w-12 h-12 rounded-2xl bg-violet-500/10 mx-auto mb-4 flex items-center justify-center">
            <Zap size={20} className="text-violet-500/60" />
          </div>
          <p className="text-sm font-semibold text-slate-500">No agent decisions yet</p>
          <p className="text-xs text-slate-700 mt-1">
            Start <code className="font-mono bg-white/[.05] px-1.5 py-0.5 rounded text-[10px]">run_live</code>{' '}
            with <code className="font-mono bg-white/[.05] px-1.5 py-0.5 rounded text-[10px]">SIGNAL_MODE=agent</code>
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-white/[.04]">
                {['Time', 'Symbol', 'Decision', 'Confidence', 'Votes', 'Blockers', 'decision_id'].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-semibold tracking-wider uppercase text-[10px] text-slate-700">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {decisions.map((d, i) => {
                const c = sigColors(d.signal_type);
                const pct = Math.round(d.confidence * 100);
                const isExpanded = expanded.has(d.id);
                const isNewest = i === 0;

                return (
                  <Fragment key={d.id}>
                    <tr
                      onClick={() => toggleRow(d.id)}
                      onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && toggleRow(d.id)}
                      role="button"
                      tabIndex={0}
                      aria-expanded={isExpanded}
                      className={`cursor-pointer transition-colors hover:bg-slate-800/50 border-b border-white/[.03] focus:outline-none focus-visible:ring-1 focus-visible:ring-violet-500 ${
                        isExpanded ? 'bg-violet-500/[.04]' : ''
                      } ${isNewest ? `border-l-2 ${c.border}` : ''}`}
                    >
                      <td className="px-4 py-3 font-mono text-[11px] text-slate-500">
                        {fmtTime(d.created_at)}
                      </td>
                      <td className="px-4 py-3 font-mono font-semibold text-white">{d.symbol}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[11px] font-mono font-semibold px-2 py-0.5 rounded-lg border ${c.text} ${c.bg} ${c.border}`}>
                          {d.signal_type}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1 w-16 rounded-full overflow-hidden bg-white/[.06] flex-shrink-0">
                            <div className={`h-full rounded-full transition-all ${c.bar}`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className={`font-mono text-xs font-semibold ${c.text}`}>{pct}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          {d.contributions.map(contrib => (
                            <VoteChip key={contrib.source} contrib={contrib} />
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {d.blockers.length > 0 ? (
                          <div className="flex gap-1 flex-wrap">
                            {d.blockers.map(b => <BlockerBadge key={b} blocker={b} />)}
                          </div>
                        ) : (
                          <span className="text-slate-800">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-[10px] text-slate-700">
                        {shortId(d.decision_id)}
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr className="border-b border-white/[.04]">
                        <td colSpan={7} className="px-5 py-4 bg-violet-500/[.03]">
                          <div className="grid grid-cols-4 gap-3 mb-4">
                            {d.contributions.map(contrib => (
                              <AgentVoteCard key={contrib.source} contrib={contrib} />
                            ))}
                          </div>
                          <div className="rounded-xl px-4 py-3 bg-white/[.02] border border-white/[.04]">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                              Full Reasoning
                            </p>
                            <p className="text-xs text-slate-500 leading-relaxed">{d.reasoning}</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Legend */}
      <div className="px-5 py-3 border-t border-white/[.04] flex flex-wrap items-center gap-4 text-[10px] text-slate-700">
        <span>N = News · F = FRED · S = Sentiment · T = Technical</span>
        <span className="text-slate-800">|</span>
        <span><s>N</s> = agent timeout / error</span>
      </div>
    </div>
  );
}

// ─── DECISION STREAM PANEL ────────────────────────────────────────────────────

function DecisionStream({ decisions }: { decisions: AgentDecision[] }) {
  const last8 = decisions.slice(0, 8);

  return (
    <div className="bg-white/[.015] border border-white/[.06] rounded-2xl overflow-hidden flex flex-col">
      <div className="px-4 py-3 border-b border-white/[.05] flex items-center justify-between flex-shrink-0">
        <span className="text-xs font-semibold text-white">Decision Stream</span>
        <span className="font-mono text-[10px] text-slate-600">UTC · realtime</span>
      </div>

      <div className="flex-1 overflow-hidden relative">
        {/* Fade overlays */}
        <div className="absolute top-0 left-0 right-0 h-8 z-10 pointer-events-none"
          style={{ background: 'linear-gradient(to bottom, #020617, transparent)' }} />
        <div className="absolute bottom-0 left-0 right-0 h-8 z-10 pointer-events-none"
          style={{ background: 'linear-gradient(to top, #020617, transparent)' }} />

        <div className="overflow-y-auto h-full py-2 px-2 space-y-px">
          {last8.length === 0 ? (
            <div className="flex items-center justify-center h-full text-xs text-slate-700 py-8">
              Waiting for decisions…
            </div>
          ) : (
            last8.map(d => {
              const c = sigColors(d.signal_type);
              return (
                <div key={d.id} className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-white/[.03] transition-colors cursor-default">
                  <span className="font-mono text-[10px] text-slate-600 flex-shrink-0">{fmtTime(d.created_at)}</span>
                  <span className="font-mono font-semibold text-[10px] text-slate-400 flex-shrink-0">{d.symbol}</span>
                  <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded flex-shrink-0 border ${c.text} ${c.bg} ${c.border}`}>
                    {d.signal_type}
                  </span>
                  <span className="font-mono text-[10px] text-slate-700 flex-shrink-0 ml-auto">{shortId(d.decision_id)}</span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export function AgentFeed() {
  const [symbolFilter, setSymbolFilter] = useState('');
  const [signalFilter, setSignalFilter] = useState<SignalFilter>('');

  const { decisions: raw, loading, connected, error, isStale, lastUpdated } = useAgentDecisions(
    symbolFilter ? { symbolFilter } : {}
  );

  // Client-side filter by signal type
  const decisions = signalFilter
    ? raw.filter(d => d.signal_type === signalFilter)
    : raw;

  const latest = decisions[0] ?? null;

  return (
    <div className="p-6 space-y-5">
      {/* ── PAGE HEADER ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-[38px] h-[38px] flex items-center justify-center rounded-xl border border-violet-500/30"
            style={{ background: 'linear-gradient(135deg, rgba(124,58,237,.25), rgba(124,58,237,.1))' }}>
            <Zap size={17} className="text-violet-400" />
          </div>
          <div>
            <h1 className="font-bold text-white text-[17px] tracking-tight leading-none mb-0.5">Agent Feed</h1>
            <p className="text-xs text-slate-600">Multi-agent consensus decisions · Supabase Realtime</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Filters */}
          <div className="flex items-center gap-1.5 bg-white/[.025] border border-white/[.06] rounded-xl px-1 py-1">
            <select
              value={symbolFilter}
              onChange={e => setSymbolFilter(e.target.value)}
              className="bg-transparent text-xs px-2 py-1 text-slate-400 focus:outline-none cursor-pointer"
            >
              <option value="">All symbols</option>
              <option value="EURUSD">EURUSD</option>
              <option value="GBPUSD">GBPUSD</option>
              <option value="USDJPY">USDJPY</option>
              <option value="XAUUSD">XAUUSD</option>
            </select>
            <div className="w-px h-4 bg-white/[.08]" />
            <select
              value={signalFilter}
              onChange={e => setSignalFilter(e.target.value as SignalFilter)}
              className="bg-transparent text-xs px-2 py-1 text-slate-400 focus:outline-none cursor-pointer"
            >
              <option value="">All signals</option>
              <option value="BUY">BUY</option>
              <option value="SELL">SELL</option>
              <option value="HOLD">HOLD</option>
            </select>
          </div>

          {/* Live badge */}
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
            connected
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              : 'bg-slate-700/30 border-slate-700 text-slate-600'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
            {connected ? 'LIVE' : 'OFFLINE'}
          </div>
        </div>
      </div>

      {/* ── ERROR BANNER ── */}
      {error && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-xs text-red-400">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {/* ── STALE FEED BANNER ── */}
      {isStale && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-950 border border-amber-700 rounded-lg text-amber-400 text-sm">
          <span>⚠</span>
          <span>
            Feed stale — no new data for{' '}
            {Math.floor((Date.now() - (lastUpdated?.getTime() ?? Date.now())) / 1000)}s.
            Check agent connection.
          </span>
        </div>
      )}

      {/* ── LOADING ── */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-600 gap-2">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-sm">Loading agent decisions…</span>
        </div>
      ) : (
        <>
          {/* ── TOP ROW: Hero + Stream ── */}
          <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 300px' }}>
            <DecisionHeroCard decision={latest} />
            <DecisionStream decisions={decisions} />
          </div>

          {/* ── AGENT HEALTH ── */}
          <AgentHealthRow decision={latest} />

          {/* ── DECISION TABLE ── */}
          <DecisionTable decisions={decisions} />
        </>
      )}
    </div>
  );
}
