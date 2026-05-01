import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface SecretInputProps {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  disabled?: boolean;
}

export function SecretInput({ id, label, value, onChange, placeholder, hint, disabled }: SecretInputProps) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide"
      >
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-3 text-sm text-white placeholder-slate-500 font-mono focus:outline-none focus:border-emerald-500/50 disabled:opacity-50 disabled:cursor-not-allowed pr-10"
        />
        <button
          type="button"
          onClick={() => setShow(v => !v)}
          aria-label={show ? `Hide ${label}` : `Show ${label}`}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 focus:outline-none focus:text-slate-300"
        >
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
      {hint && (
        <p className="text-xs text-slate-600 mt-1">{hint}</p>
      )}
    </div>
  );
}
