import { useState } from 'react';
import { TrendingUp, TrendingDown, Minus, Clock, Brain, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import type { AIPrediction } from '../../types/aiProvider';

interface Props {
  predictions: AIPrediction[];
  loading: boolean;
}

function SignalBadge({ signal }: { signal: 'BUY' | 'SELL' | 'HOLD' }) {
  const map = {
    BUY: { cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20', icon: TrendingUp },
    SELL: { cls: 'bg-red-500/15 text-red-400 border-red-500/20', icon: TrendingDown },
    HOLD: { cls: 'bg-slate-700 text-slate-400 border-slate-600', icon: Minus },
  };
  const { cls, icon: Icon } = map[signal];
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${cls}`}>
      <Icon size={10} />
      {signal}
    </span>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 70 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-slate-400 tabular-nums w-8 text-right">{pct}%</span>
    </div>
  );
}

function PredictionRow({ pred }: { pred: AIPrediction }) {
  const [expanded, setExpanded] = useState(false);
  const time = new Date(pred.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const indicators = Object.entries(pred.indicators_snapshot).slice(0, 4);

  return (
    <div className="border-b border-slate-800/50 last:border-0">
      <div className="flex items-center gap-3 py-3 px-4 hover:bg-slate-800/30 transition-colors">
        <span className="text-sm font-mono font-semibold text-white w-20 flex-shrink-0">{pred.symbol}</span>
        <SignalBadge signal={pred.signal} />
        <div className="flex-1 min-w-0">
          <ConfidenceBar value={pred.confidence} />
        </div>
        <span className="text-xs text-slate-600 flex items-center gap-1 flex-shrink-0 w-14 text-right">
          <Clock size={10} />
          {time}
        </span>
        <button
          onClick={() => setExpanded(v => !v)}
          className="text-slate-600 hover:text-slate-400 transition-colors flex-shrink-0"
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          <div className="bg-slate-800/40 rounded-lg p-3">
            <p className="text-xs text-slate-500 mb-1 font-medium">AI Reasoning</p>
            <p className="text-xs text-slate-300 leading-relaxed">{pred.reasoning}</p>
          </div>
          {indicators.length > 0 && (
            <div>
              <p className="text-xs text-slate-500 mb-2 font-medium">Indicators at Signal</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {indicators.map(([k, v]) => (
                  <div key={k} className="bg-slate-800/60 rounded-lg px-2.5 py-2">
                    <p className="text-xs text-slate-600 mb-0.5 capitalize">{k.replace(/_/g, ' ')}</p>
                    <p className="text-sm font-mono text-slate-200">{typeof v === 'number' ? v.toFixed(4) : String(v)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="flex items-center justify-between text-xs text-slate-600">
            <span>Model: <span className="text-slate-500">{pred.model_name}</span></span>
            <span>Latency: <span className="text-slate-500">{pred.latency_ms}ms</span></span>
            <span>Price: <span className="text-slate-500">{pred.price_at_signal.toFixed(5)}</span></span>
          </div>
        </div>
      )}
    </div>
  );
}

export function AISignalPanel({ predictions, loading }: Props) {
  const buys = predictions.filter(p => p.signal === 'BUY').length;
  const sells = predictions.filter(p => p.signal === 'SELL').length;
  const holds = predictions.filter(p => p.signal === 'HOLD').length;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain size={15} className="text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-200">AI Signal Feed</h3>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-emerald-400">{buys} BUY</span>
          <span className="text-red-400">{sells} SELL</span>
          <span className="text-slate-500">{holds} HOLD</span>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <div className="flex items-center gap-2 text-slate-600 text-sm">
            <div className="w-4 h-4 border-2 border-slate-700 border-t-slate-400 rounded-full animate-spin" />
            Loading signals...
          </div>
        </div>
      ) : predictions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 gap-2">
          <AlertCircle size={24} className="text-slate-700" />
          <p className="text-sm text-slate-600">No AI signals yet</p>
          <p className="text-xs text-slate-700">Configure an AI provider and start the engine</p>
        </div>
      ) : (
        <div className="max-h-80 overflow-y-auto">
          {predictions.map(p => (
            <PredictionRow key={p.id} pred={p} />
          ))}
        </div>
      )}
    </div>
  );
}
