import React, { useEffect, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export type ToastVariant = 'default' | 'destructive' | 'success' | 'info';

export interface ToastOptions {
  title: string;
  description?: string;
  variant?: ToastVariant;
  durationMs?: number;
}

export interface ToastEntry extends ToastOptions {
  id: string;
}

type Listener = (toasts: ToastEntry[]) => void;

const listeners = new Set<Listener>();
let currentToasts: ToastEntry[] = [];

function notify(): void {
  listeners.forEach(l => l(currentToasts));
}

function addToast(options: ToastOptions): string {
  const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const entry: ToastEntry = {
    id,
    title: options.title,
    description: options.description,
    variant: options.variant ?? 'default',
    durationMs: options.durationMs ?? 6000,
  };
  currentToasts = [...currentToasts, entry];
  notify();

  if (entry.durationMs && entry.durationMs > 0) {
    setTimeout(() => dismissToast(id), entry.durationMs);
  }

  return id;
}

function dismissToast(id: string): void {
  currentToasts = currentToasts.filter(t => t.id !== id);
  notify();
}

export function useToast(): {
  toast: (options: ToastOptions) => string;
  dismiss: (id: string) => void;
} {
  const toast = useCallback((options: ToastOptions) => addToast(options), []);
  const dismiss = useCallback((id: string) => dismissToast(id), []);
  return { toast, dismiss };
}

const VARIANT_STYLES: Record<ToastVariant, { container: string; icon: React.ReactNode; title: string }> = {
  default: {
    container: 'bg-slate-800 border-slate-700',
    icon: <Info size={18} className="text-slate-300" />,
    title: 'text-slate-100',
  },
  destructive: {
    container: 'bg-red-950/90 border-red-700',
    icon: <AlertCircle size={18} className="text-red-400" />,
    title: 'text-red-100',
  },
  success: {
    container: 'bg-emerald-950/90 border-emerald-700',
    icon: <CheckCircle2 size={18} className="text-emerald-400" />,
    title: 'text-emerald-100',
  },
  info: {
    container: 'bg-sky-950/90 border-sky-700',
    icon: <Info size={18} className="text-sky-400" />,
    title: 'text-sky-100',
  },
};

export function Toaster(): React.ReactElement {
  const [toasts, setToasts] = useState<ToastEntry[]>(currentToasts);

  useEffect(() => {
    const listener: Listener = next => setToasts(next);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map(t => {
        const style = VARIANT_STYLES[t.variant ?? 'default'];
        return (
          <div
            key={t.id}
            role="alert"
            className={`pointer-events-auto rounded-lg border shadow-lg p-3.5 flex items-start gap-3 backdrop-blur-sm animate-in slide-in-from-right ${style.container}`}
          >
            <div className="flex-shrink-0 mt-0.5">{style.icon}</div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold leading-tight ${style.title}`}>{t.title}</p>
              {t.description && (
                <p className="text-xs text-slate-300 mt-1 leading-snug break-words">{t.description}</p>
              )}
            </div>
            <button
              onClick={() => dismissToast(t.id)}
              className="flex-shrink-0 text-slate-400 hover:text-slate-200 transition-colors"
              aria-label="Dismiss notification"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
