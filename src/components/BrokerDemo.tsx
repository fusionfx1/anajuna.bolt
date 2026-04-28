import React, { useState, useEffect, useCallback } from 'react';
import {
  Zap, RefreshCw, CheckCircle2, XCircle, Clock, Loader2,
  TrendingUp, TrendingDown, AlertCircle, Shield, Wallet,
  ArrowUpDown, BarChart3, X, ChevronRight, Activity,
  Radio
} from 'lucide-react';
import { brokerService } from '../services/brokerService';
import { oandaService } from '../services/oandaService';
import type { BrokerAccount } from '../services/brokerService';
import type { OandaAccount } from '../services/oandaService';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { DataFeedConfig } from '../types/dataFeed';

type BrokerTab = 'alpaca' | 'oanda';

interface DemoOrder {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit';
  qty: number;
  limitPrice?: number;
  status: 'pending' | 'submitted' | 'filled' | 'rejected';
  brokerOrderId?: string;
  filledAvgPrice?: number;
  submittedAt: string;
  latencyMs?: number;
  broker: BrokerTab;
}

type FXPair = {
  symbol: string;
  bid: number;
  ask: number;
  spread: number;
  change: number;
};

const BASE_PRICES: Record<string, number> = {
  EURUSD: 1.08542,
  GBPUSD: 1.26415,
  USDJPY: 153.24,
  AUDUSD: 0.65318,
  USDCAD: 1.36241,
  EURUSD_ALT: 1.08542,
  AAPL: 187.42,
  TSLA: 172.18,
  SPY: 498.65,
};

function generateTick(base: number, isJpy: boolean): { bid: number; ask: number } {
  const noise = (Math.random() - 0.5) * (isJpy ? 0.05 : 0.0005);
  const spread = isJpy ? 0.018 : 0.00018;
  const mid = base + noise;
  return { bid: parseFloat((mid - spread / 2).toFixed(isJpy ? 3 : 5)), ask: parseFloat((mid + spread / 2).toFixed(isJpy ? 3 : 5)) };
}

const ALPACA_SYMBOLS = ['AAPL', 'TSLA', 'SPY'];
const OANDA_SYMBOLS = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD'];

function AccountCard({
  broker,
  account,
  loading,
  onRefresh,
}: {
  broker: BrokerTab;
  account: BrokerAccount | OandaAccount | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  const isAlpaca = broker === 'alpaca';
  const acct = account as (BrokerAccount & OandaAccount) | null;

  const stats = acct
    ? isAlpaca
      ? [
          { label: 'Portfolio Value', value: `$${acct.portfolioValue?.toLocaleString('en-US', { minimumFractionDigits: 2 })}` },
          { label: 'Cash', value: `$${acct.cash?.toLocaleString('en-US', { minimumFractionDigits: 2 })}` },
          { label: 'Buying Power', value: `$${acct.buyingPower?.toLocaleString('en-US', { minimumFractionDigits: 2 })}` },
          { label: 'Day Trades', value: acct.daytradeCount?.toString() ?? '0' },
        ]
      : [
          { label: 'Balance', value: `$${acct.balance?.toLocaleString('en-US', { minimumFractionDigits: 2 })}` },
          { label: 'NAV', value: `$${acct.nav?.toLocaleString('en-US', { minimumFractionDigits: 2 })}` },
          { label: 'Margin Used', value: `$${acct.marginUsed?.toLocaleString('en-US', { minimumFractionDigits: 2 })}` },
          { label: 'Open Trades', value: acct.openTradeCount?.toString() ?? '0' },
        ]
    : [];

  const unrealized = isAlpaca
    ? null
    : acct?.unrealizedPL;

  return (
    <div className={`rounded-2xl border p-5 space-y-4 ${isAlpaca ? 'border-sky-500/20 bg-sky-500/5' : 'border-emerald-500/20 bg-emerald-500/5'}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isAlpaca ? 'bg-sky-500/15' : 'bg-emerald-500/15'}`}>
            <Wallet size={18} className={isAlpaca ? 'text-sky-400' : 'text-emerald-400'} />
          </div>
          <div>
            <p className="font-semibold text-white">{isAlpaca ? 'Alpaca Markets' : 'OANDA'}</p>
            <p className="text-xs text-slate-500">
              {isAlpaca ? (brokerService.isPaperTrading() ? 'Paper Trading' : 'Live Trading') : (oandaService.isPractice() ? 'Practice Account' : 'Live Account')}
            </p>
          </div>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="p-2 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded-lg transition-colors"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-12 bg-slate-800/60 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : acct ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            {stats.map(s => (
              <div key={s.label} className="bg-slate-800/50 rounded-lg p-3">
                <p className="text-xs text-slate-500 mb-0.5">{s.label}</p>
                <p className="text-sm font-semibold text-white font-mono">{s.value}</p>
              </div>
            ))}
          </div>
          {unrealized !== null && unrealized !== undefined && (
            <div className={`flex items-center justify-between p-2.5 rounded-lg ${unrealized >= 0 ? 'bg-emerald-500/8 border border-emerald-500/15' : 'bg-red-500/8 border border-red-500/15'}`}>
              <span className="text-xs text-slate-400">Unrealized P&L</span>
              <span className={`text-sm font-bold font-mono ${unrealized >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {unrealized >= 0 ? '+' : ''}{unrealized.toFixed(2)}
              </span>
            </div>
          )}
          {isAlpaca && acct.patternDayTrader && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-500/8 border border-amber-500/15">
              <AlertCircle size={12} className="text-amber-400" />
              <span className="text-xs text-amber-300">Pattern Day Trader flagged</span>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-4">
          <p className="text-xs text-slate-500">Configure credentials in Settings to load account data</p>
        </div>
      )}
    </div>
  );
}

function TickerRow({ pair, onClick }: { pair: FXPair; onClick: () => void }) {
  const isJpy = pair.symbol.includes('JPY');
  const dec = isJpy ? 3 : 5;
  const changing = Math.abs(pair.change) > 0;
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-800/50 transition-colors w-full text-left group"
    >
      <div className="flex items-center gap-3">
        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <span className="font-mono text-sm font-semibold text-white">{pair.symbol}</span>
      </div>
      <div className="flex items-center gap-6 text-xs">
        <span className="font-mono text-slate-400">{pair.bid.toFixed(dec)}</span>
        <span className="font-mono text-white font-medium">{pair.ask.toFixed(dec)}</span>
        <span className="text-slate-600 font-mono">{(pair.spread * (isJpy ? 100 : 100000)).toFixed(1)}p</span>
        <span className={`w-16 text-right font-medium ${pair.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          {pair.change >= 0 ? '+' : ''}{pair.change.toFixed(isJpy ? 2 : 4)}
        </span>
        <ChevronRight size={12} className="text-slate-600 group-hover:text-slate-400 transition-colors" />
      </div>
    </button>
  );
}

function OrderRow({ order }: { order: DemoOrder }) {
  const isJpy = order.symbol.includes('JPY');
  const dec = isJpy ? 3 : 5;
  const statusMap = {
    pending: { icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/10', label: 'Pending' },
    submitted: { icon: Loader2, color: 'text-blue-400', bg: 'bg-blue-500/10', label: 'Submitted' },
    filled: { icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10', label: 'Filled' },
    rejected: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10', label: 'Rejected' },
  };
  const s = statusMap[order.status];
  const Icon = s.icon;

  return (
    <div className="flex items-center gap-4 px-4 py-3 border-b border-slate-800/60 hover:bg-slate-800/20 transition-colors">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${s.bg}`}>
        <Icon size={13} className={`${s.color} ${order.status === 'submitted' ? 'animate-spin' : ''}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-sm font-semibold text-white">{order.symbol}</span>
          <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${order.side === 'buy' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
            {order.side.toUpperCase()}
          </span>
          <span className="text-xs text-slate-500 capitalize">{order.type}</span>
          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${order.broker === 'alpaca' ? 'bg-sky-500/10 text-sky-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
            {order.broker === 'alpaca' ? 'Alpaca' : 'OANDA'}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
          <span>Qty: <span className="text-slate-300">{order.qty}</span></span>
          {order.filledAvgPrice && (
            <span>Fill: <span className="text-emerald-400 font-mono">{order.filledAvgPrice.toFixed(dec)}</span></span>
          )}
          {order.latencyMs && (
            <span>Latency: <span className="text-slate-300">{order.latencyMs}ms</span></span>
          )}
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.color}`}>
          {s.label}
        </div>
        <p className="text-xs text-slate-600 mt-1">{new Date(order.submittedAt).toLocaleTimeString()}</p>
      </div>
    </div>
  );
}

interface QuickOrderModalProps {
  symbol: string;
  broker: BrokerTab;
  bid: number;
  ask: number;
  onSubmit: (side: 'buy' | 'sell', qty: number, type: 'market' | 'limit', limitPrice?: number) => void;
  onClose: () => void;
}

function QuickOrderModal({ symbol, broker, bid, ask, onSubmit, onClose }: QuickOrderModalProps) {
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [qty, setQty] = useState('1');
  const [type, setType] = useState<'market' | 'limit'>('market');
  const [limitPrice, setLimitPrice] = useState('');
  const isJpy = symbol.includes('JPY');
  const dec = isJpy ? 3 : 5;
  const price = side === 'buy' ? ask : bid;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <div>
            <h3 className="font-semibold text-white">{symbol}</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              via {broker === 'alpaca' ? 'Alpaca Markets' : 'OANDA'}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-slate-800/50 rounded-lg p-3 text-center">
              <p className="text-xs text-slate-500 mb-0.5">BID</p>
              <p className="font-mono text-sm text-red-400 font-semibold">{bid.toFixed(dec)}</p>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3 text-center">
              <p className="text-xs text-slate-500 mb-0.5">ASK</p>
              <p className="font-mono text-sm text-emerald-400 font-semibold">{ask.toFixed(dec)}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setSide('buy')}
              className={`py-3 rounded-xl text-sm font-bold transition-all border ${side === 'buy' ? 'bg-emerald-500 border-emerald-500 text-slate-900' : 'border-slate-700 bg-slate-800 text-slate-400 hover:text-white'}`}
            >
              <TrendingUp size={14} className="inline mr-1.5" />BUY
            </button>
            <button
              onClick={() => setSide('sell')}
              className={`py-3 rounded-xl text-sm font-bold transition-all border ${side === 'sell' ? 'bg-red-500 border-red-500 text-white' : 'border-slate-700 bg-slate-800 text-slate-400 hover:text-white'}`}
            >
              <TrendingDown size={14} className="inline mr-1.5" />SELL
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide">Type</label>
              <select
                value={type}
                onChange={e => setType(e.target.value as 'market' | 'limit')}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500/50"
              >
                <option value="market">Market</option>
                <option value="limit">Limit</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide">Quantity</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={qty}
                onChange={e => setQty(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500/50"
              />
            </div>
          </div>

          {type === 'limit' && (
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide">Limit Price</label>
              <input
                type="number"
                step={isJpy ? '0.001' : '0.00001'}
                value={limitPrice}
                onChange={e => setLimitPrice(e.target.value)}
                placeholder={price.toFixed(dec)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-emerald-500/50"
              />
            </div>
          )}

          <div className="p-3 bg-slate-800/40 rounded-lg flex justify-between text-xs">
            <span className="text-slate-400">Est. Price</span>
            <span className="font-mono text-white font-medium">{price.toFixed(dec)}</span>
          </div>

          <button
            onClick={() => {
              onSubmit(side, parseFloat(qty) || 1, type, limitPrice ? parseFloat(limitPrice) : undefined);
              onClose();
            }}
            className={`w-full py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
              side === 'buy' ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-900' : 'bg-red-500 hover:bg-red-400 text-white'
            }`}
          >
            <Shield size={14} />
            Submit {side.toUpperCase()} Order
          </button>
        </div>
      </div>
    </div>
  );
}

export function BrokerDemo() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<BrokerTab>('alpaca');
  const [alpacaAccount, setAlpacaAccount] = useState<BrokerAccount | null>(null);
  const [oandaAccount, setOandaAccount] = useState<OandaAccount | null>(null);
  const [loadingAlpaca, setLoadingAlpaca] = useState(false);
  const [loadingOanda, setLoadingOanda] = useState(false);
  const [tickers, setTickers] = useState<Map<string, FXPair>>(new Map());
  const [orders, setOrders] = useState<DemoOrder[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [configured, setConfigured] = useState<{ alpaca: boolean; oanda: boolean }>({ alpaca: false, oanda: false });

  const allSymbols = [...OANDA_SYMBOLS, ...ALPACA_SYMBOLS];

  useEffect(() => {
    const initial = new Map<string, FXPair>();
    allSymbols.forEach(sym => {
      const base = BASE_PRICES[sym] ?? 100;
      const isJpy = sym.includes('JPY');
      const { bid, ask } = generateTick(base, isJpy);
      initial.set(sym, { symbol: sym, bid, ask, spread: ask - bid, change: 0 });
    });
    setTickers(initial);

    const interval = setInterval(() => {
      setTickers(prev => {
        const next = new Map(prev);
        allSymbols.forEach(sym => {
          const old = prev.get(sym);
          if (!old) return;
          const base = BASE_PRICES[sym] ?? 100;
          const isJpy = sym.includes('JPY');
          const { bid, ask } = generateTick(base + (old.change ?? 0), isJpy);
          const change = parseFloat(((bid + ask) / 2 - base).toFixed(isJpy ? 3 : 5));
          next.set(sym, { symbol: sym, bid, ask, spread: ask - bid, change });
        });
        return next;
      });
    }, 800);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from('data_feed_configs')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        const hasAlpaca = !!(data.alpaca_key_id);
        const hasOanda = !!(data.oanda_account_id);
        setConfigured({ alpaca: hasAlpaca, oanda: hasOanda });

        if (hasAlpaca) {
          brokerService.configure({
            provider: 'alpaca',
            keyId: data.alpaca_key_id,
            secretKey: data.alpaca_secret_key,
            paperTrading: data.paper_trading ?? true,
          });
        }
        if (hasOanda) {
          oandaService.configure({
            accountId: data.oanda_account_id,
            apiToken: data.oanda_api_token,
            accountType: data.oanda_account_type ?? 'practice',
          });
        }
      });
  }, [user?.id]);

  const fetchAlpaca = useCallback(async () => {
    setLoadingAlpaca(true);
    try {
      const acct = await brokerService.getAccount();
      setAlpacaAccount(acct);
    } catch {
      // Broker not configured; set to null to show user message
      setAlpacaAccount(null);
    } finally {
      setLoadingAlpaca(false);
    }
  }, []);

  const fetchOanda = useCallback(async () => {
    setLoadingOanda(true);
    try {
      const acct = await oandaService.getAccount();
      setOandaAccount(acct);
    } catch {
      // OANDA not configured; set to null to show user message
      setOandaAccount(null);
    } finally {
      setLoadingOanda(false);
    }
  }, []);

  useEffect(() => {
    fetchAlpaca();
    fetchOanda();
  }, []);

  const symbols = activeTab === 'alpaca' ? ALPACA_SYMBOLS : OANDA_SYMBOLS;

  const handleOrderSubmit = async (
    symbol: string,
    broker: BrokerTab,
    side: 'buy' | 'sell',
    qty: number,
    type: 'market' | 'limit',
    limitPrice?: number
  ) => {
    const id = `DEMO-${Date.now()}`;
    const order: DemoOrder = {
      id,
      symbol,
      side,
      type,
      qty,
      limitPrice,
      status: 'submitted',
      broker,
      submittedAt: new Date().toISOString(),
    };
    setOrders(prev => [order, ...prev]);

    const t0 = performance.now();
    try {
      const managed = {
        id,
        clientOrderId: id,
        symbol,
        side,
        orderType: type,
        quantity: qty,
        limitPrice,
        status: 'pending' as const,
        filledQty: 0,
        riskApproved: true,
        submittedAt: new Date().toISOString(),
        timeInForce: 'day' as const,
      };

      let res;
      if (broker === 'oanda') {
        res = await oandaService.submitOrder(managed);
      } else {
        res = await brokerService.submitOrder(managed);
      }

      const latency = Math.round(performance.now() - t0);
      setOrders(prev =>
        prev.map(o =>
          o.id === id
            ? {
                ...o,
                status: res.status === 'filled' || res.status === 'accepted' ? 'filled' : res.status === 'rejected' ? 'rejected' : 'submitted',
                brokerOrderId: res.brokerOrderId,
                filledAvgPrice: res.filledAvgPrice,
                latencyMs: latency,
              }
            : o
        )
      );

      if (broker === 'alpaca') fetchAlpaca();
      else fetchOanda();
    } catch {
      setOrders(prev => prev.map(o => o.id === id ? { ...o, status: 'rejected' } : o));
    }
  };

  const selectedTicker = selectedSymbol ? tickers.get(selectedSymbol) : null;
  const selectedBroker = selectedSymbol
    ? (OANDA_SYMBOLS.includes(selectedSymbol) ? 'oanda' : 'alpaca')
    : activeTab;

  const totalOrders = orders.length;
  const filledOrders = orders.filter(o => o.status === 'filled').length;
  const avgLatency = orders.filter(o => o.latencyMs).length
    ? Math.round(orders.filter(o => o.latencyMs).reduce((s, o) => s + (o.latencyMs ?? 0), 0) / orders.filter(o => o.latencyMs).length)
    : 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Broker Demo</h1>
          <p className="text-sm text-slate-400 mt-0.5">Live order execution demo for Alpaca Markets and OANDA</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Prices Live
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <p className="text-xs text-slate-500 mb-1">Orders Submitted</p>
          <p className="text-2xl font-bold text-white">{totalOrders}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <p className="text-xs text-slate-500 mb-1">Fill Rate</p>
          <p className="text-2xl font-bold text-emerald-400">
            {totalOrders > 0 ? Math.round((filledOrders / totalOrders) * 100) : 0}%
          </p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <p className="text-xs text-slate-500 mb-1">Avg Latency</p>
          <p className="text-2xl font-bold text-sky-400">{avgLatency > 0 ? `${avgLatency}ms` : '—'}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <AccountCard broker="alpaca" account={alpacaAccount} loading={loadingAlpaca} onRefresh={fetchAlpaca} />
        <AccountCard broker="oanda" account={oandaAccount} loading={loadingOanda} onRefresh={fetchOanda} />
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Activity size={15} className="text-slate-400" />
            <span className="text-sm font-medium text-white">Live Quotes</span>
          </div>
          <div className="flex gap-1 bg-slate-800/50 p-0.5 rounded-lg">
            {(['alpaca', 'oanda'] as BrokerTab[]).map(t => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors capitalize ${
                  activeTab === t ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {t === 'alpaca' ? 'Alpaca (US Equities)' : 'OANDA (Forex)'}
              </button>
            ))}
          </div>
        </div>

        <div className="divide-y divide-slate-800/60">
          <div className="flex items-center justify-between px-4 py-2 bg-slate-800/30">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Symbol</span>
            <div className="flex items-center gap-6 text-xs font-medium text-slate-500 uppercase tracking-wide">
              <span>Bid</span>
              <span>Ask</span>
              <span>Spread</span>
              <span className="w-16 text-right">Change</span>
              <span className="w-12" />
            </div>
          </div>
          {symbols.map(sym => {
            const t = tickers.get(sym);
            if (!t) return null;
            return (
              <TickerRow
                key={sym}
                pair={t}
                onClick={() => setSelectedSymbol(sym)}
              />
            );
          })}
        </div>
        <div className="px-4 py-2.5 border-t border-slate-800 bg-slate-900/50">
          <p className="text-xs text-slate-600">Click any row to open a quick order panel</p>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <BarChart3 size={15} className="text-slate-400" />
            <span className="text-sm font-medium text-white">Order Activity</span>
            {orders.length > 0 && (
              <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">{orders.length}</span>
            )}
          </div>
          {orders.length > 0 && (
            <button
              onClick={() => setOrders([])}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              Clear
            </button>
          )}
        </div>

        {orders.length === 0 ? (
          <div className="text-center py-14">
            <Radio size={28} className="text-slate-700 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">No orders yet</p>
            <p className="text-slate-600 text-xs mt-1">Click a ticker row above to submit a demo order</p>
          </div>
        ) : (
          <div>
            {orders.map(o => <OrderRow key={o.id} order={o} />)}
          </div>
        )}
      </div>

      {!configured.alpaca && !configured.oanda && (
        <div className="flex items-start gap-3 p-4 bg-amber-500/8 border border-amber-500/20 rounded-xl">
          <AlertCircle size={16} className="text-amber-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-300">Using mock data</p>
            <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
              No broker credentials configured. Orders and account data use simulated values.
              Configure real credentials in <span className="text-white">Settings → Data Feed & Broker</span> to trade live.
            </p>
          </div>
        </div>
      )}

      {selectedSymbol && selectedTicker && (
        <QuickOrderModal
          symbol={selectedSymbol}
          broker={selectedBroker}
          bid={selectedTicker.bid}
          ask={selectedTicker.ask}
          onSubmit={(side, qty, type, limitPrice) => {
            handleOrderSubmit(selectedSymbol, selectedBroker, side, qty, type, limitPrice);
            setSelectedSymbol(null);
          }}
          onClose={() => setSelectedSymbol(null)}
        />
      )}
    </div>
  );
}
