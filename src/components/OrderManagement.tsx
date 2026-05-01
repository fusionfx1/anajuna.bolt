import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Plus, X, RefreshCw, CheckCircle2, XCircle, Clock,
  AlertCircle, TrendingUp, TrendingDown, Filter,
  Shield, Loader2, ArrowUpDown, BookOpen
} from 'lucide-react';
import type { ManagedOrder, OrderStatus, RiskCheckResult } from '../types/dataFeed';
import { useOrderManager, useRiskManager } from '../hooks/useOrderManager';
import { useLiveQuotes } from '../hooks/useDataFeed';
import { useAccountData } from '../hooks/useSupabaseData';
import { FOREX_SYMBOLS } from '../lib/constants';

const SYMBOLS = FOREX_SYMBOLS.slice(0, 8);
const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string; bg: string; icon: LucideIcon }> = {
  pending: { label: 'Pending', color: 'text-amber-400', bg: 'bg-amber-500/10', icon: Clock },
  submitted: { label: 'Submitted', color: 'text-blue-400', bg: 'bg-blue-500/10', icon: Loader2 },
  partially_filled: { label: 'Partial', color: 'text-cyan-400', bg: 'bg-cyan-500/10', icon: ArrowUpDown },
  filled: { label: 'Filled', color: 'text-emerald-400', bg: 'bg-emerald-500/10', icon: CheckCircle2 },
  cancelled: { label: 'Cancelled', color: 'text-slate-400', bg: 'bg-slate-700/50', icon: X },
  rejected: { label: 'Rejected', color: 'text-red-400', bg: 'bg-red-500/10', icon: XCircle },
  expired: { label: 'Expired', color: 'text-slate-500', bg: 'bg-slate-700/50', icon: Clock },
};

interface NewOrderFormProps {
  onSubmit: (params: {
    symbol: string;
    side: 'buy' | 'sell';
    orderType: 'market' | 'limit' | 'stop' | 'stop_limit';
    quantity: number;
    limitPrice?: number;
    stopPrice?: number;
    timeInForce: 'day' | 'gtc' | 'ioc' | 'fok';
    currentPrice: number;
    accountState: { equity: number; balance: number; peakEquity: number; dailyPnl: number; openPositionsCount: number; openSymbols: string[] };
  }) => void;
  onClose: () => void;
  currentQuotes: Map<string, { bid: number; ask: number }>;
  accountEquity: number;
}

function NewOrderForm({ onSubmit, onClose, currentQuotes, accountEquity }: NewOrderFormProps) {
  const { calculatePositionSize } = useRiskManager();
  const [symbol, setSymbol] = useState('EURUSD');
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [orderType, setOrderType] = useState<'market' | 'limit' | 'stop' | 'stop_limit'>('market');
  const [quantity, setQuantity] = useState('1');
  const [limitPrice, setLimitPrice] = useState('');
  const [stopPrice, setStopPrice] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [timeInForce, setTimeInForce] = useState<'day' | 'gtc' | 'ioc' | 'fok'>('day');
  const [submitting, setSubmitting] = useState(false);

  const q = currentQuotes.get(symbol);
  const currentPrice = q ? (side === 'buy' ? q.ask : q.bid) : 0;
  const isJpy = symbol.includes('JPY');
  const decimals = isJpy ? 3 : 5;

  const suggestedSize = stopLoss && currentPrice
    ? calculatePositionSize(accountEquity, 0.01, currentPrice, parseFloat(stopLoss))
    : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    await onSubmit({
      symbol,
      side,
      orderType,
      quantity: parseFloat(quantity) || 0,
      limitPrice: limitPrice ? parseFloat(limitPrice) : undefined,
      stopPrice: stopPrice ? parseFloat(stopPrice) : undefined,
      timeInForce,
      currentPrice,
      accountState: {
        equity: accountEquity,
        balance: accountEquity,
        peakEquity: accountEquity * 1.05,
        dailyPnl: 0,
        openPositionsCount: 0,
        openSymbols: [],
      },
    });
    setSubmitting(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <h3 className="font-semibold text-white">New Order</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide">Symbol</label>
            <select
              value={symbol}
              onChange={e => setSymbol(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500/50"
            >
              {SYMBOLS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setSide('buy')}
              className={`py-2.5 rounded-lg text-sm font-bold transition-all border ${
                side === 'buy'
                  ? 'bg-emerald-500 border-emerald-500 text-slate-900'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
            >
              <TrendingUp size={14} className="inline mr-1.5" />
              BUY
            </button>
            <button
              type="button"
              onClick={() => setSide('sell')}
              className={`py-2.5 rounded-lg text-sm font-bold transition-all border ${
                side === 'sell'
                  ? 'bg-red-500 border-red-500 text-white'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
            >
              <TrendingDown size={14} className="inline mr-1.5" />
              SELL
            </button>
          </div>

          {currentPrice > 0 && (
            <div className="p-3 bg-slate-800/50 rounded-lg">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Market Price</span>
                <span className="font-mono text-white">{currentPrice.toFixed(decimals)}</span>
              </div>
              {q && (
                <div className="flex justify-between text-xs mt-1">
                  <span className="text-slate-400">Spread</span>
                  <span className="font-mono text-slate-300">
                    {((q.ask - q.bid) * (isJpy ? 1000 : 100000)).toFixed(1)} pips
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide">Order Type</label>
              <select
                value={orderType}
                onChange={e => setOrderType(e.target.value as typeof orderType)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500/50"
              >
                <option value="market">Market</option>
                <option value="limit">Limit</option>
                <option value="stop">Stop</option>
                <option value="stop_limit">Stop Limit</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide">Time In Force</label>
              <select
                value={timeInForce}
                onChange={e => setTimeInForce(e.target.value as typeof timeInForce)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500/50"
              >
                <option value="day">Day</option>
                <option value="gtc">GTC</option>
                <option value="ioc">IOC</option>
                <option value="fok">FOK</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide">
              Quantity (lots)
              {suggestedSize && (
                <button
                  type="button"
                  onClick={() => setQuantity(suggestedSize.quantity.toString())}
                  className="ml-2 text-emerald-400 hover:text-emerald-300 normal-case font-normal"
                >
                  Use suggested: {suggestedSize.quantity}
                </button>
              )}
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={quantity}
              onChange={e => setQuantity(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500/50"
            />
          </div>

          {(orderType === 'limit' || orderType === 'stop_limit') && (
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide">Limit Price</label>
              <input
                type="number"
                step={isJpy ? '0.001' : '0.00001'}
                value={limitPrice}
                onChange={e => setLimitPrice(e.target.value)}
                placeholder={currentPrice.toFixed(decimals)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500/50"
              />
            </div>
          )}

          {(orderType === 'stop' || orderType === 'stop_limit') && (
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide">Stop Price</label>
              <input
                type="number"
                step={isJpy ? '0.001' : '0.00001'}
                value={stopPrice}
                onChange={e => setStopPrice(e.target.value)}
                placeholder={currentPrice.toFixed(decimals)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500/50"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide">
              Stop Loss (for position sizing)
            </label>
            <input
              type="number"
              step={isJpy ? '0.001' : '0.00001'}
              value={stopLoss}
              onChange={e => setStopLoss(e.target.value)}
              placeholder="Optional — enables risk-based sizing"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500/50"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !quantity || parseFloat(quantity) <= 0}
              className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 ${
                side === 'buy'
                  ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-900'
                  : 'bg-red-500 hover:bg-red-400 text-white'
              }`}
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <Shield size={14} />}
              Submit {side.toUpperCase()} Order
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface RiskCheckModalProps {
  result: RiskCheckResult;
  order: ManagedOrder;
  onClose: () => void;
}

function RiskCheckModal({ result, order, onClose }: RiskCheckModalProps) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Shield size={16} className={result.approved ? 'text-emerald-400' : 'text-red-400'} />
            <h3 className="font-semibold text-white">Risk Check Result</h3>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className={`p-3 rounded-lg border text-sm ${result.approved ? 'bg-emerald-500/8 border-emerald-500/20 text-emerald-400' : 'bg-red-500/8 border-red-500/20 text-red-400'}`}>
            <div className="flex items-center gap-2 font-medium mb-1">
              {result.approved ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
              {result.approved ? 'Order Approved' : 'Order Rejected'}
            </div>
            <p className="text-xs opacity-80">{result.reason ?? (result.approved ? 'All risk checks passed' : 'Risk check failed')}</p>
          </div>

          <div className="space-y-2">
            {result.checks.map((check, i) => (
              <div key={i} className="flex items-start gap-2.5 p-2.5 bg-slate-800/50 rounded-lg">
                <div className={`mt-0.5 flex-shrink-0 ${check.passed ? 'text-emerald-400' : 'text-red-400'}`}>
                  {check.passed ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-200">{check.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{check.detail}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="pt-2 grid grid-cols-3 gap-2 text-xs">
            <div className="bg-slate-800/50 rounded-lg p-2">
              <p className="text-slate-500 mb-0.5">Symbol</p>
              <p className="font-mono text-white">{order.symbol}</p>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-2">
              <p className="text-slate-500 mb-0.5">Side</p>
              <p className={`font-bold ${order.side === 'buy' ? 'text-emerald-400' : 'text-red-400'}`}>{order.side.toUpperCase()}</p>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-2">
              <p className="text-slate-500 mb-0.5">Status</p>
              <p className={STATUS_CONFIG[order.status].color}>{STATUS_CONFIG[order.status].label}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-full py-2.5 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export function OrderManagement() {
  const { orders, pendingCount, stats, submitOrder, cancelOrder, refreshOrderStatus } = useOrderManager();
  const { getQuote } = useLiveQuotes(SYMBOLS);
  const { account } = useAccountData();
  const [showForm, setShowForm] = useState(false);
  const [lastResult, setLastResult] = useState<{ result: RiskCheckResult; order: ManagedOrder } | null>(null);
  const [filterStatus, setFilterStatus] = useState<OrderStatus | 'all'>('all');
  const [refreshing, setRefreshing] = useState<string | null>(null);

  const quoteMap = new Map(
    SYMBOLS.map(s => {
      const q = getQuote(s);
      return [s, { bid: q?.bid ?? 0, ask: q?.ask ?? 0 }];
    })
  );

  const handleSubmit = async (params: Parameters<typeof submitOrder>[0]) => {
    const { order, riskCheck } = await submitOrder(params);
    setLastResult({ result: riskCheck, order });
    setShowForm(false);
  };

  const handleRefresh = async (orderId: string) => {
    setRefreshing(orderId);
    await refreshOrderStatus(orderId);
    setRefreshing(null);
  };

  const filtered = filterStatus === 'all' ? orders : orders.filter(o => o.status === filterStatus);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Order Management</h1>
          <p className="text-sm text-slate-400 mt-0.5">Submit, track, and manage orders with pre-trade risk controls</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-900 text-sm font-bold rounded-lg transition-colors"
        >
          <Plus size={15} />
          New Order
        </button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Orders', value: stats.total, color: 'text-white' },
          { label: 'Filled', value: stats.filled, color: 'text-emerald-400' },
          { label: 'Rejected', value: stats.rejected, color: 'text-red-400' },
          { label: 'Fill Rate', value: `${stats.fillRate}%`, color: 'text-blue-400' },
        ].map(m => (
          <div key={m.label} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <p className="text-xs text-slate-500 mb-1">{m.label}</p>
            <p className={`text-2xl font-bold ${m.color}`}>{m.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <BookOpen size={15} className="text-slate-400" />
            <span className="text-sm font-medium text-white">Order Ledger</span>
            {pendingCount > 0 && (
              <span className="bg-amber-500/15 text-amber-400 border border-amber-500/20 text-xs font-medium px-2 py-0.5 rounded-full">
                {pendingCount} open
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Filter size={13} className="text-slate-500" />
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value as OrderStatus | 'all')}
              className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-300 focus:outline-none"
            >
              <option value="all">All Orders</option>
              {Object.keys(STATUS_CONFIG).map(s => (
                <option key={s} value={s}>{STATUS_CONFIG[s as OrderStatus].label}</option>
              ))}
            </select>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <BookOpen size={32} className="text-slate-700 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">No orders yet</p>
            <p className="text-slate-600 text-xs mt-1">Click "New Order" to submit your first order</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {filtered.map(order => {
              const sc = STATUS_CONFIG[order.status];
              const Icon = sc.icon;
              const isOpen = order.status === 'pending' || order.status === 'submitted' || order.status === 'partially_filled';

              return (
                <div key={order.id} className="flex items-center gap-4 px-4 py-3 hover:bg-slate-800/30 transition-colors">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${sc.bg}`}>
                    <Icon size={14} className={`${sc.color} ${order.status === 'submitted' ? 'animate-spin' : ''}`} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-white">{order.symbol}</span>
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                        order.side === 'buy' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
                      }`}>
                        {order.side.toUpperCase()}
                      </span>
                      <span className="text-xs text-slate-500 capitalize">{order.orderType}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs text-slate-400">Qty: <span className="text-slate-300">{order.quantity}</span></span>
                      {order.filledQty > 0 && (
                        <span className="text-xs text-slate-400">
                          Filled: <span className="text-emerald-400">{order.filledQty}</span>
                          {order.filledAvgPrice && ` @ ${order.filledAvgPrice.toFixed(order.symbol.includes('JPY') ? 3 : 5)}`}
                        </span>
                      )}
                      {order.rejectionReason && (
                        <span className="text-xs text-red-400 truncate max-w-48">{order.rejectionReason}</span>
                      )}
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${sc.bg} ${sc.color}`}>
                      {sc.label}
                    </div>
                    <p className="text-xs text-slate-600 mt-1">
                      {new Date(order.submittedAt).toLocaleTimeString()}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {!order.riskApproved && order.status !== 'rejected' && (
                      <AlertCircle size={13} className="text-amber-400" aria-label="Risk check pending" />
                    )}
                    {order.riskApproved && (
                      <Shield size={13} className="text-emerald-400/60" aria-label="Risk approved" />
                    )}
                    {isOpen && (
                      <>
                        <button
                          onClick={() => handleRefresh(order.id)}
                          className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-700 rounded transition-colors"
                          title="Refresh status"
                        >
                          <RefreshCw size={12} className={refreshing === order.id ? 'animate-spin' : ''} />
                        </button>
                        <button
                          onClick={() => cancelOrder(order.id)}
                          className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                          title="Cancel order"
                        >
                          <X size={12} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showForm && (
        <NewOrderForm
          onSubmit={handleSubmit}
          onClose={() => setShowForm(false)}
          currentQuotes={quoteMap}
          accountEquity={account?.equity ?? 10000}
        />
      )}

      {lastResult && (
        <RiskCheckModal
          result={lastResult.result}
          order={lastResult.order}
          onClose={() => setLastResult(null)}
        />
      )}
    </div>
  );
}
