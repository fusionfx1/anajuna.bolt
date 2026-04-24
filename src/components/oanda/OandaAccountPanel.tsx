import React from 'react';
import {
  RefreshCw, Wifi, TrendingUp, TrendingDown,
  DollarSign, BarChart2, AlertCircle, Loader2, Clock,
  ArrowUpRight, ArrowDownRight, Shield
} from 'lucide-react';
import { useOandaAccount } from '../../hooks/useOandaAccount';
import type { OandaPosition, OandaTrade } from '../../types/oanda';

function formatCurrency(value: number, digits = 2): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatPrice(value: number, instrument: string): string {
  const isJpy = instrument.includes('JPY');
  return value.toFixed(isJpy ? 3 : 5);
}

function formatTime(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function PLBadge({ value }: { value: number }) {
  const positive = value >= 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums ${
        positive ? 'text-emerald-400' : 'text-red-400'
      }`}
    >
      {positive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
      {positive ? '+' : ''}
      {formatCurrency(value)}
    </span>
  );
}


function TradeRow({ trade }: { trade: OandaTrade }) {
  const displayName = trade.instrument.replace('_', '/');
  const side = trade.currentUnits > 0 ? 'LONG' : 'SHORT';

  return (
    <tr className="border-b border-white/5 hover:bg-white/3 transition-colors">
      <td className="py-2.5 pr-3">
        <span className="text-sm font-semibold text-white font-mono">{displayName}</span>
      </td>
      <td className="py-2.5 pr-3">
        <span
          className={`inline-block text-xs font-bold px-1.5 py-0.5 rounded ${
            side === 'LONG'
              ? 'bg-emerald-500/15 text-emerald-400'
              : 'bg-red-500/15 text-red-400'
          }`}
        >
          {side}
        </span>
      </td>
      <td className="py-2.5 pr-3 text-right">
        <span className="text-sm font-mono text-slate-300">
          {formatPrice(trade.price, trade.instrument)}
        </span>
      </td>
      <td className="py-2.5 pr-3 text-right">
        <span className="text-xs text-slate-400 flex items-center justify-end gap-1">
          <Clock className="w-3 h-3" />
          {formatTime(trade.openTime)}
        </span>
      </td>
      <td className="py-2.5 text-right">
        <PLBadge value={trade.unrealizedPL} />
      </td>
    </tr>
  );
}

export function OandaAccountPanel() {
  const { account, positions, trades, loading, error, lastRefreshedAt, isPractice, refresh } =
    useOandaAccount();

  const totalUnrealizedPL = positions.reduce((sum, p) => sum + p.unrealizedPL, 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center">
            <BarChart2 className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">OANDA Account</h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              {isPractice ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  <span className="text-xs text-amber-400">Practice</span>
                </>
              ) : (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs text-emerald-400">Live</span>
                </>
              )}
              {lastRefreshedAt && (
                <span className="text-xs text-slate-500 ml-1">
                  Updated {formatTime(new Date(lastRefreshedAt).toISOString())}
                </span>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
          <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !account && (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
        </div>
      )}

      {/* Account summary cards */}
      {account && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-white/5 border border-white/8">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-xs text-slate-400">Balance</span>
              </div>
              <p className="text-lg font-bold text-white tabular-nums">
                ${formatCurrency(account.balance)}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-white/5 border border-white/8">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-xs text-slate-400">NAV</span>
              </div>
              <p className="text-lg font-bold text-white tabular-nums">
                ${formatCurrency(account.nav)}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-white/5 border border-white/8">
              <div className="flex items-center gap-2 mb-1">
                <Shield className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-xs text-slate-400">Margin Used</span>
              </div>
              <p className="text-lg font-bold text-white tabular-nums">
                ${formatCurrency(account.marginUsed)}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-white/5 border border-white/8">
              <div className="flex items-center gap-2 mb-1">
                {totalUnrealizedPL >= 0 ? (
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <TrendingDown className="w-3.5 h-3.5 text-red-400" />
                )}
                <span className="text-xs text-slate-400">Unrealized P&L</span>
              </div>
              <p
                className={`text-lg font-bold tabular-nums ${
                  totalUnrealizedPL >= 0 ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                {totalUnrealizedPL >= 0 ? '+' : ''}${formatCurrency(totalUnrealizedPL)}
              </p>
            </div>
          </div>

          {/* Margin available bar */}
          <div className="p-3 rounded-xl bg-white/5 border border-white/8 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Margin Available</span>
              <span className="text-white font-semibold">
                ${formatCurrency(account.marginAvailable)}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
                style={{
                  width: `${Math.min(
                    100,
                    (account.marginAvailable / (account.marginAvailable + account.marginUsed)) * 100
                  ).toFixed(1)}%`,
                }}
              />
            </div>
            <div className="flex justify-between text-xs text-slate-500">
              <span>{account.openPositionCount} open position{account.openPositionCount !== 1 ? 's' : ''}</span>
              <span>{account.openTradeCount} open trade{account.openTradeCount !== 1 ? 's' : ''}</span>
            </div>
          </div>

          {/* Open Positions */}
          {positions.length > 0 && (
            <div className="rounded-xl bg-white/5 border border-white/8 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-white/8">
                <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                  <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                  Open Positions
                </h4>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-white/5">
                      <th className="px-4 py-2 text-xs font-medium text-slate-500">Pair</th>
                      <th className="px-3 py-2 text-xs font-medium text-slate-500">Side</th>
                      <th className="px-3 py-2 text-xs font-medium text-slate-500 text-right">Units</th>
                      <th className="px-3 py-2 text-xs font-medium text-slate-500 text-right">Avg Price</th>
                      <th className="px-3 py-2 text-xs font-medium text-slate-500 text-right">P&L</th>
                    </tr>
                  </thead>
                  <tbody className="px-4">
                    {positions.map(p => (
                      <tr key={p.instrument} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                        <td className="px-4 py-2.5 pr-3">
                          <span className="text-sm font-semibold text-white font-mono">
                            {p.instrument.replace('_', '/')}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3">
                          <span className={`inline-block text-xs font-bold px-1.5 py-0.5 rounded ${p.longUnits > 0 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
                            {p.longUnits > 0 ? 'LONG' : 'SHORT'}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 text-right">
                          <span className="text-sm text-slate-300 tabular-nums">
                            {(p.longUnits > 0 ? p.longUnits : p.shortUnits).toLocaleString()}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 text-right">
                          <span className="text-sm text-slate-300 font-mono">
                            {formatPrice(p.longUnits > 0 ? p.longAvgPrice : p.shortAvgPrice, p.instrument)}
                          </span>
                        </td>
                        <td className="py-2.5 pr-4 text-right">
                          <PLBadge value={p.unrealizedPL} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Open Trades */}
          {trades.length > 0 && (
            <div className="rounded-xl bg-white/5 border border-white/8 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-white/8">
                <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-sky-400" />
                  Open Trades
                </h4>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-white/5">
                      <th className="px-4 py-2 text-xs font-medium text-slate-500">Pair</th>
                      <th className="px-3 py-2 text-xs font-medium text-slate-500">Side</th>
                      <th className="px-3 py-2 text-xs font-medium text-slate-500 text-right">Entry</th>
                      <th className="px-3 py-2 text-xs font-medium text-slate-500 text-right">Opened</th>
                      <th className="px-3 py-2 text-xs font-medium text-slate-500 text-right">P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trades.map(t => (
                      <TradeRow key={t.tradeId} trade={t} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {positions.length === 0 && trades.length === 0 && !loading && (
            <div className="py-8 text-center">
              <p className="text-sm text-slate-500">No open positions or trades</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
