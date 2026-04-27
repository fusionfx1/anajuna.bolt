import React, { useState, useRef, useEffect } from 'react';
import { Search, TrendingUp, TrendingDown, Star } from 'lucide-react';
import { useMarketData } from '../hooks/useMarketData';
import { useUserSettings } from '../hooks/useSupabaseData';
import { useAuth } from '../context/AuthContext';
import { upsertUserSettings } from '../services/tradingService';
import { useToast } from './ui/Toast';
import type { MarketQuote } from '../types/trading';

function SparkLine({ history, color }: { history: number[]; color: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || history.length < 2) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pts = history;
    const min = Math.min(...pts);
    const max = Math.max(...pts);
    const range = max - min || 0.0001;
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.beginPath();
    pts.forEach((p, i) => {
      const x = (i / (pts.length - 1)) * w;
      const y = h - ((p - min) / range) * h * 0.8 - h * 0.1;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }, [history, color]);

  return <canvas ref={canvasRef} width={80} height={32} className="opacity-80" />;
}

function QuoteRow({
  quote, history, starred, onStar,
}: {
  quote: MarketQuote;
  history: number[];
  starred: boolean;
  onStar: () => void;
}) {
  const isPositive = quote.change_pct >= 0;
  const prevBidRef = useRef(quote.bid);
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);

  useEffect(() => {
    if (quote.bid !== prevBidRef.current) {
      setFlash(quote.bid > prevBidRef.current ? 'up' : 'down');
      prevBidRef.current = quote.bid;
      const t = setTimeout(() => setFlash(null), 400);
      return () => clearTimeout(t);
    }
  }, [quote.bid]);

  const dp = quote.symbol.includes('JPY') || quote.symbol === 'XAUUSD' ? 3 : 5;
  const spreadPips = (quote.ask - quote.bid) * (quote.symbol.includes('JPY') || quote.symbol === 'XAUUSD' ? 100 : 10000);

  return (
    <tr className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          <button onClick={onStar} className={`transition-colors ${starred ? 'text-amber-400' : 'text-slate-700 hover:text-slate-500'}`}>
            <Star size={12} fill={starred ? 'currentColor' : 'none'} />
          </button>
          <span className="font-semibold text-white text-sm">{quote.symbol}</span>
        </div>
      </td>
      <td className={`py-3 px-4 font-mono text-sm tabular-nums transition-colors duration-300 ${
        flash === 'up' ? 'text-emerald-300' : flash === 'down' ? 'text-red-300' : 'text-slate-200'
      }`}>
        {quote.bid.toFixed(dp)}
      </td>
      <td className={`py-3 px-4 font-mono text-sm tabular-nums transition-colors duration-300 ${
        flash === 'up' ? 'text-emerald-300' : flash === 'down' ? 'text-red-300' : 'text-slate-200'
      }`}>
        {quote.ask.toFixed(dp)}
      </td>
      <td className="py-3 px-4 text-xs text-slate-500 tabular-nums">{spreadPips.toFixed(1)}</td>
      <td className="py-3 px-4">
        <div className={`flex items-center gap-1 text-xs font-semibold ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
          {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          {isPositive ? '+' : ''}{quote.change_pct.toFixed(2)}%
        </div>
      </td>
      <td className="py-3 px-4">
        <SparkLine history={history} color={isPositive ? '#10b981' : '#ef4444'} />
      </td>
      <td className="py-3 px-4 text-xs text-slate-400 tabular-nums">{quote.high_24h.toFixed(dp)}</td>
      <td className="py-3 px-4 text-xs text-slate-400 tabular-nums">{quote.low_24h.toFixed(dp)}</td>
      <td className="py-3 px-4 text-xs text-slate-500 tabular-nums">{(quote.volume / 1000).toFixed(1)}K</td>
    </tr>
  );
}

const DEFAULT_STARRED = ['EURUSD', 'GBPUSD', 'USDJPY'];

export function MarketWatch() {
  const { user } = useAuth();
  const { quotes } = useMarketData(600);
  const { settings } = useUserSettings();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [starred, setStarred] = useState<Set<string>>(new Set(DEFAULT_STARRED));
  const [showStarredOnly, setShowStarredOnly] = useState(false);
  const priceHistoryRef = useRef<Map<string, number[]>>(new Map());

  useEffect(() => {
    if (settings?.starred_symbols && Array.isArray(settings.starred_symbols)) {
      setStarred(new Set(settings.starred_symbols as string[]));
    }
  }, [settings]);

  useEffect(() => {
    quotes.forEach(q => {
      const hist = priceHistoryRef.current.get(q.symbol) ?? [];
      const next = [...hist, q.bid].slice(-30);
      priceHistoryRef.current.set(q.symbol, next);
    });
  }, [quotes]);

  const filtered = quotes.filter(q => {
    const matchSearch = q.symbol.includes(search.toUpperCase());
    const matchStar = !showStarredOnly || starred.has(q.symbol);
    return matchSearch && matchStar;
  });

  const toggleStar = (symbol: string) => {
    setStarred(prev => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      const updated = Array.from(next);
      if (user) {
        upsertUserSettings(user.id, { starred_symbols: updated }).catch(err => {
          toast({
            variant: 'destructive',
            title: 'Could not save starred symbols',
            description: err instanceof Error ? err.message : 'Unknown error',
          });
        });
      }
      return next;
    });
  };

  return (
    <div className="p-6 space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {quotes.slice(0, 4).map(q => {
          const dp = q.symbol.includes('JPY') || q.symbol === 'XAUUSD' ? 3 : 5;
          const isPos = q.change_pct >= 0;
          return (
            <div key={q.symbol} className={`bg-slate-900 border rounded-xl p-4 ${isPos ? 'border-emerald-500/20' : 'border-red-500/20'}`}>
              <div className="flex justify-between items-start mb-2">
                <span className="text-sm font-semibold text-slate-300">{q.symbol}</span>
                <span className={`text-xs font-semibold ${isPos ? 'text-emerald-400' : 'text-red-400'}`}>
                  {isPos ? '+' : ''}{q.change_pct.toFixed(2)}%
                </span>
              </div>
              <p className="text-xl font-bold text-white tabular-nums">{q.bid.toFixed(dp)}</p>
              <div className="flex justify-between mt-1 text-xs text-slate-500">
                <span>Ask: {q.ask.toFixed(dp)}</span>
                <span>{((q.ask - q.bid) * (q.symbol.includes('JPY') || q.symbol === 'XAUUSD' ? 100 : 10000)).toFixed(1)} pips</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="flex items-center gap-3 p-4 border-b border-slate-800">
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search symbol..."
              className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-3 py-2 text-sm text-slate-200 placeholder-slate-500 outline-none focus:border-slate-600"
            />
          </div>
          <button
            onClick={() => setShowStarredOnly(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
              showStarredOnly ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20' : 'bg-slate-800 text-slate-400 border border-slate-700'
            }`}
          >
            <Star size={12} fill={showStarredOnly ? 'currentColor' : 'none'} />
            Starred
          </button>
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
            <span className="text-xs text-slate-500">Live feed active</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="border-b border-slate-800 text-xs text-slate-500 uppercase tracking-wider">
                <th className="text-left py-3 px-4 font-medium">Symbol</th>
                <th className="text-left py-3 px-4 font-medium">Bid</th>
                <th className="text-left py-3 px-4 font-medium">Ask</th>
                <th className="text-left py-3 px-4 font-medium">Spread</th>
                <th className="text-left py-3 px-4 font-medium">Change</th>
                <th className="text-left py-3 px-4 font-medium">Trend</th>
                <th className="text-left py-3 px-4 font-medium">High 24h</th>
                <th className="text-left py-3 px-4 font-medium">Low 24h</th>
                <th className="text-left py-3 px-4 font-medium">Volume</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(q => (
                <QuoteRow
                  key={q.symbol}
                  quote={q}
                  history={priceHistoryRef.current.get(q.symbol) ?? [q.bid]}
                  starred={starred.has(q.symbol)}
                  onStar={() => toggleStar(q.symbol)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
