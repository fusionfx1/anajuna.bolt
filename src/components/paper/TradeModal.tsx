import { useState, useEffect, useRef } from 'react';
import { X, TrendingUp, TrendingDown, AlertCircle, CheckCircle } from 'lucide-react';
import type { TradeSide, PaperAccount } from '../../types/paper';
import { priceDp, PAPER_INSTRUMENTS } from '../../types/paper';

interface TradeModalProps {
  instrument: string;
  side: TradeSide;
  bid: number;
  ask: number;
  account: PaperAccount;
  onConfirm: (units: number, tp: number | null, sl: number | null) => Promise<void>;
  onClose: () => void;
}

function InputField({
  label, value, onChange, placeholder, hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-400 mb-1">{label}</label>
      <input
        type="number"
        step="any"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 placeholder-slate-600 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      {hint && <p className="text-[10px] text-slate-600 mt-1">{hint}</p>}
    </div>
  );
}

export function TradeModal({ instrument, side, bid, ask, account, onConfirm, onClose }: TradeModalProps) {
  const [units,    setUnits]    = useState('1000');
  const [tp,       setTp]       = useState('');
  const [sl,       setSl]       = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [success,  setSuccess]  = useState(false);

  const dp          = priceDp(instrument);
  const label       = PAPER_INSTRUMENTS[instrument] ?? instrument;
  const isBuy       = side === 'buy';
  const entryPrice  = isBuy ? ask : bid;

  // Live bid/ask ticks — kept in ref so the interval sees fresh values
  const priceRef = useRef({ bid, ask });
  priceRef.current = { bid, ask };

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const validate = (): string | null => {
    const u = parseInt(units, 10);
    if (!units || isNaN(u) || u <= 0) return 'Units must be a positive integer.';
    if (u > 10_000_000) return 'Units cannot exceed 10,000,000.';
    if (tp && isNaN(parseFloat(tp))) return 'Take profit must be a valid number.';
    if (sl && isNaN(parseFloat(sl))) return 'Stop loss must be a valid number.';
    if (isBuy  && tp && parseFloat(tp) <= entryPrice) return 'TP must be above entry for a buy.';
    if (!isBuy && tp && parseFloat(tp) >= entryPrice) return 'TP must be below entry for a sell.';
    if (isBuy  && sl && parseFloat(sl) >= entryPrice) return 'SL must be below entry for a buy.';
    if (!isBuy && sl && parseFloat(sl) <= entryPrice) return 'SL must be above entry for a sell.';
    return null;
  };

  const handleSubmit = async () => {
    const validationError = validate();
    if (validationError) { setError(validationError); return; }
    setError(null);
    setSubmitting(true);
    try {
      await onConfirm(
        parseInt(units, 10),
        tp ? parseFloat(tp) : null,
        sl ? parseFloat(sl) : null,
      );
      setSuccess(true);
      setTimeout(onClose, 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open trade.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-4 border-b border-slate-800 ${
          isBuy ? 'bg-emerald-500/10' : 'bg-red-500/10'
        }`}>
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              isBuy ? 'bg-emerald-500/20' : 'bg-red-500/20'
            }`}>
              {isBuy
                ? <TrendingUp  size={16} className="text-emerald-400" />
                : <TrendingDown size={16} className="text-red-400" />}
            </div>
            <div>
              <p className={`text-sm font-bold ${isBuy ? 'text-emerald-400' : 'text-red-400'}`}>
                {isBuy ? 'Buy' : 'Sell'} {label}
              </p>
              <p className="text-[10px] text-slate-500">Paper Trade</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors p-1">
            <X size={16} />
          </button>
        </div>

        {/* Price strip */}
        <div className="flex divide-x divide-slate-800 bg-slate-950/50">
          <div className="flex-1 text-center py-3">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Bid</p>
            <p className={`font-mono text-sm font-semibold ${isBuy ? 'text-slate-400' : 'text-red-400'}`}>
              {bid.toFixed(dp)}
            </p>
          </div>
          <div className="flex-1 text-center py-3 relative">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Entry</p>
            <p className={`font-mono text-base font-bold ${isBuy ? 'text-emerald-400' : 'text-red-400'}`}>
              {entryPrice.toFixed(dp)}
            </p>
            <span className="absolute -bottom-0 left-1/2 -translate-x-1/2 text-[9px] text-slate-600">
              {isBuy ? 'Ask' : 'Bid'}
            </span>
          </div>
          <div className="flex-1 text-center py-3">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Ask</p>
            <p className={`font-mono text-sm font-semibold ${isBuy ? 'text-emerald-400' : 'text-slate-400'}`}>
              {ask.toFixed(dp)}
            </p>
          </div>
        </div>

        {/* Form */}
        <div className="px-5 py-4 space-y-4">
          <InputField
            label="Units"
            value={units}
            onChange={setUnits}
            placeholder="1000"
            hint="Minimum 1 unit"
          />
          <div className="grid grid-cols-2 gap-3">
            <InputField
              label="Take Profit"
              value={tp}
              onChange={setTp}
              placeholder={`e.g. ${(entryPrice + (isBuy ? 1 : -1) * 0.005).toFixed(dp)}`}
            />
            <InputField
              label="Stop Loss"
              value={sl}
              onChange={setSl}
              placeholder={`e.g. ${(entryPrice + (isBuy ? -1 : 1) * 0.003).toFixed(dp)}`}
            />
          </div>

          {/* Account balance */}
          <div className="flex items-center justify-between text-xs text-slate-500 bg-slate-800/50 rounded-lg px-3 py-2">
            <span>Paper balance</span>
            <span className="font-mono text-slate-300">${account.balance.toFixed(2)}</span>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">
              <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Success */}
          {success && (
            <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 rounded-lg px-3 py-2">
              <CheckCircle size={13} />
              <span>Trade opened!</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium text-slate-400 bg-slate-800 hover:bg-slate-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || success}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all duration-150 disabled:opacity-50 ${
              isBuy
                ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-900'
                : 'bg-red-500 hover:bg-red-400 text-white'
            }`}
          >
            {submitting ? 'Opening…' : success ? 'Opened!' : `${isBuy ? 'Buy' : 'Sell'} @ Market`}
          </button>
        </div>
      </div>
    </div>
  );
}
