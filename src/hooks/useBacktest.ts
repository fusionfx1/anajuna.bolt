import { useState, useRef, useCallback } from 'react';
import type {
  BacktestConfig, BacktestResult, BacktestProgress, BacktestStatus,
  WorkerOutMessage,
} from '../types/backtest';
import type { Candle } from '../services/backtestEngine';

export function useBacktest() {
  const [status, setStatus] = useState<BacktestStatus>('idle');
  const [progress, setProgress] = useState<BacktestProgress | null>(null);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);

  const run = useCallback((config: BacktestConfig, candles: Candle[]) => {
    // Terminate any existing worker
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }

    setStatus('running');
    setProgress(null);
    setResult(null);
    setError(null);

    const worker = new Worker(
      new URL('../workers/backtestWorker.ts', import.meta.url),
      { type: 'module' },
    );

    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<WorkerOutMessage>) => {
      const msg = event.data;
      switch (msg.type) {
        case 'progress':
          setProgress(msg.data);
          break;
        case 'complete':
          setResult(msg.data);
          setStatus('completed');
          worker.terminate();
          workerRef.current = null;
          break;
        case 'error':
          setError(msg.message);
          setStatus('failed');
          worker.terminate();
          workerRef.current = null;
          break;
      }
    };

    worker.onerror = (e) => {
      setError(e.message || 'Worker error');
      setStatus('failed');
      worker.terminate();
      workerRef.current = null;
    };

    worker.postMessage({ type: 'run', config, candles });
  }, []);

  const cancel = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    setStatus('cancelled');
  }, []);

  const reset = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    setStatus('idle');
    setProgress(null);
    setResult(null);
    setError(null);
  }, []);

  return { status, progress, result, error, run, cancel, reset };
}
