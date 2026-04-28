import { runBacktest } from '../services/backtestEngine';
import { getStrategyFn } from '../services/backtestStrategies';
import type { WorkerInMessage, WorkerOutMessage } from '../types/backtest';

self.onmessage = (event: MessageEvent<WorkerInMessage>) => {
  const msg = event.data;

  if (msg.type === 'cancel') {
    return;
  }

  if (msg.type === 'run') {
    try {
      const strategyFn = getStrategyFn(msg.config.strategyType);

      const result = runBacktest(
        msg.candles,
        msg.config,
        strategyFn,
        (progress) => {
          const out: WorkerOutMessage = { type: 'progress', data: progress };
          self.postMessage(out);
        },
      );

      const out: WorkerOutMessage = { type: 'complete', data: result };
      self.postMessage(out);
    } catch (err) {
      const out: WorkerOutMessage = {
        type: 'error',
        message: err instanceof Error ? err.message : 'Unknown engine error',
      };
      self.postMessage(out);
    }
  }
};
