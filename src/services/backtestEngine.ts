import type {
  BacktestConfig, BacktestResult, BacktestMetrics, BacktestProgress,
  SimulatedTrade, EquityCurvePoint,
} from '../types/backtest';

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Strategy signal returned by strategy functions
export interface Signal {
  side: 'BUY' | 'SELL' | null;
  tp?: number;
  sl?: number;
}

export type StrategyFn = (
  candles: Candle[],
  index: number,
  config: Record<string, unknown>,
  state: Record<string, unknown>,
) => Signal;

interface OpenPosition {
  id: number;
  side: 'BUY' | 'SELL';
  entryBar: number;
  entryPrice: number;
  units: number;
  tp: number | null;
  sl: number | null;
  commission: number;
}

// --- Pip size helpers ---

function pipSize(instrument: string): number {
  if (instrument.includes('JPY')) return 0.01;
  if (instrument.includes('XAU')) return 0.1;
  return 0.0001;
}

function applySlippage(
  price: number, side: 'BUY' | 'SELL',
  mode: 'none' | 'fixed' | 'random', pips: number, pip: number,
): number {
  if (mode === 'none') return price;
  const slip = mode === 'fixed' ? pips * pip : Math.random() * pips * pip;
  return side === 'BUY' ? price + slip : price - slip;
}

// --- Core engine ---

export function runBacktest(
  candles: Candle[],
  config: BacktestConfig,
  strategyFn: StrategyFn,
  onProgress?: (p: BacktestProgress) => void,
): BacktestResult {
  const pip = pipSize(config.instrument);
  const commissionPerSide = config.commissionPips * pip;

  let balance = config.initialBalance;
  let peak = balance;
  let maxDrawdown = 0;
  let nextTradeId = 1;

  const openPositions: OpenPosition[] = [];
  const closedTrades: SimulatedTrade[] = [];
  const equityCurve: EquityCurvePoint[] = [];
  const strategyState: Record<string, unknown> = {};

  const PROGRESS_INTERVAL = Math.max(1, Math.floor(candles.length / 100));

  for (let i = 0; i < candles.length; i++) {
    const bar = candles[i];

    // Check TP/SL on open positions
    for (let p = openPositions.length - 1; p >= 0; p--) {
      const pos = openPositions[p];
      let exitPrice: number | null = null;
      let reason: SimulatedTrade['reason'] = 'signal';

      if (pos.side === 'BUY') {
        if (pos.sl !== null && bar.low <= pos.sl) {
          exitPrice = pos.sl;
          reason = 'sl';
        } else if (pos.tp !== null && bar.high >= pos.tp) {
          exitPrice = pos.tp;
          reason = 'tp';
        }
      } else {
        if (pos.sl !== null && bar.high >= pos.sl) {
          exitPrice = pos.sl;
          reason = 'sl';
        } else if (pos.tp !== null && bar.low <= pos.tp) {
          exitPrice = pos.tp;
          reason = 'tp';
        }
      }

      if (exitPrice !== null) {
        const commission = commissionPerSide * pos.units;
        const rawPnl = pos.side === 'BUY'
          ? (exitPrice - pos.entryPrice) * pos.units
          : (pos.entryPrice - exitPrice) * pos.units;
        const pnl = rawPnl - commission - pos.commission;

        closedTrades.push({
          id: pos.id,
          side: pos.side,
          entryTime: candles[pos.entryBar].time,
          exitTime: bar.time,
          entryPrice: pos.entryPrice,
          exitPrice,
          units: pos.units,
          pnl: parseFloat(pnl.toFixed(2)),
          pnlPct: parseFloat(((pnl / config.initialBalance) * 100).toFixed(4)),
          reason,
          commission: parseFloat((commission + pos.commission).toFixed(4)),
        });
        balance += pnl;
        openPositions.splice(p, 1);
      }
    }

    // Get signal from strategy
    const signal = strategyFn(candles, i, config.strategyConfig, strategyState);

    if (signal.side && openPositions.length === 0) {
      const entryPrice = applySlippage(
        bar.close, signal.side, config.slippage, config.slippagePips, pip,
      );

      let units: number;
      if (config.positionSizing === 'risk_pct') {
        const riskAmount = balance * (config.riskPct / 100);
        const slDist = signal.sl ? Math.abs(entryPrice - signal.sl) : 20 * pip;
        units = slDist > 0 ? Math.floor(riskAmount / slDist) : Math.floor(balance / entryPrice);
      } else {
        units = config.lotSize;
      }

      if (units > 0) {
        const commission = commissionPerSide * units;
        openPositions.push({
          id: nextTradeId++,
          side: signal.side,
          entryBar: i,
          entryPrice,
          units,
          tp: signal.tp ?? null,
          sl: signal.sl ?? null,
          commission,
        });
      }
    }

    // Compute equity (mark-to-market open positions)
    let unrealizedPnl = 0;
    for (const pos of openPositions) {
      unrealizedPnl += pos.side === 'BUY'
        ? (bar.close - pos.entryPrice) * pos.units
        : (pos.entryPrice - bar.close) * pos.units;
    }
    const equity = balance + unrealizedPnl;
    if (equity > peak) peak = equity;
    const dd = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
    if (dd > maxDrawdown) maxDrawdown = dd;

    equityCurve.push({
      time: bar.time,
      balance: parseFloat(balance.toFixed(2)),
      equity: parseFloat(equity.toFixed(2)),
      drawdownPct: parseFloat(dd.toFixed(2)),
    });

    // Progress callback
    if (onProgress && (i % PROGRESS_INTERVAL === 0 || i === candles.length - 1)) {
      onProgress({
        currentBar: i + 1,
        totalBars: candles.length,
        pct: Math.round(((i + 1) / candles.length) * 100),
        openTrades: openPositions.length,
        closedTrades: closedTrades.length,
        currentBalance: parseFloat(balance.toFixed(2)),
      });
    }
  }

  // Force-close any remaining positions at last candle
  const lastBar = candles[candles.length - 1];
  for (const pos of openPositions) {
    const exitPrice = lastBar.close;
    const commission = commissionPerSide * pos.units;
    const rawPnl = pos.side === 'BUY'
      ? (exitPrice - pos.entryPrice) * pos.units
      : (pos.entryPrice - exitPrice) * pos.units;
    const pnl = rawPnl - commission - pos.commission;

    closedTrades.push({
      id: pos.id,
      side: pos.side,
      entryTime: candles[pos.entryBar].time,
      exitTime: lastBar.time,
      entryPrice: pos.entryPrice,
      exitPrice,
      units: pos.units,
      pnl: parseFloat(pnl.toFixed(2)),
      pnlPct: parseFloat(((pnl / config.initialBalance) * 100).toFixed(4)),
      reason: 'end_of_data',
      commission: parseFloat((commission + pos.commission).toFixed(4)),
    });
    balance += pnl;
  }

  const metrics = computeMetrics(closedTrades, config.initialBalance, maxDrawdown, candles);

  return {
    metrics,
    trades: closedTrades,
    equityCurve,
    candleCount: candles.length,
  };
}

// --- Metrics computation ---

function computeMetrics(
  trades: SimulatedTrade[],
  initialBalance: number,
  maxDrawdown: number,
  candles: Candle[],
): BacktestMetrics {
  if (trades.length === 0) {
    return {
      totalTrades: 0, wins: 0, losses: 0, winRate: 0,
      netPnl: 0, netPnlPct: 0, grossProfit: 0, grossLoss: 0,
      avgWin: 0, avgLoss: 0, profitFactor: 0,
      maxDrawdown: 0, sharpeRatio: 0, sortinoRatio: 0, calmarRatio: 0,
      expectancy: 0, avgDurationBars: 0,
      maxConsecutiveWins: 0, maxConsecutiveLosses: 0,
      monthlyPnl: [],
    };
  }

  const winTrades = trades.filter(t => t.pnl > 0);
  const lossTrades = trades.filter(t => t.pnl <= 0);
  const grossProfit = winTrades.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(lossTrades.reduce((s, t) => s + t.pnl, 0));
  const netPnl = grossProfit - grossLoss;
  const avgWin = winTrades.length > 0 ? grossProfit / winTrades.length : 0;
  const avgLoss = lossTrades.length > 0 ? -(grossLoss / lossTrades.length) : 0;

  // Consecutive wins/losses
  let maxConsecWins = 0, maxConsecLosses = 0, curWins = 0, curLosses = 0;
  for (const t of trades) {
    if (t.pnl > 0) { curWins++; curLosses = 0; }
    else { curLosses++; curWins = 0; }
    if (curWins > maxConsecWins) maxConsecWins = curWins;
    if (curLosses > maxConsecLosses) maxConsecLosses = curLosses;
  }

  // Duration in bars
  const candleTimeMap = new Map(candles.map((c, i) => [c.time, i]));
  const durations = trades.map(t => {
    const entryIdx = candleTimeMap.get(t.entryTime) ?? 0;
    const exitIdx = candleTimeMap.get(t.exitTime) ?? entryIdx;
    return exitIdx - entryIdx;
  });
  const avgDurationBars = durations.reduce((s, d) => s + d, 0) / durations.length;

  // Sharpe / Sortino
  const pnlSeries = trades.map(t => t.pnl);
  const avgReturn = netPnl / trades.length;
  const variance = trades.length > 1
    ? pnlSeries.reduce((a, r) => a + (r - avgReturn) ** 2, 0) / (trades.length - 1)
    : 0;
  const stdDev = Math.sqrt(variance);
  const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;

  const downReturns = pnlSeries.filter(r => r < 0);
  const downStd = downReturns.length > 0
    ? Math.sqrt(downReturns.reduce((a, r) => a + r * r, 0) / downReturns.length)
    : 0;
  const sortinoRatio = downStd > 0 ? (avgReturn / downStd) * Math.sqrt(252) : 0;

  const annualizedReturn = avgReturn * 252;
  const calmarRatio = maxDrawdown > 0 ? annualizedReturn / (maxDrawdown * initialBalance / 100) : 0;

  // Monthly P&L
  const monthMap = new Map<string, { pnl: number; trades: number }>();
  for (const t of trades) {
    const d = new Date(t.exitTime * 1000);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const entry = monthMap.get(key) ?? { pnl: 0, trades: 0 };
    entry.pnl += t.pnl;
    entry.trades++;
    monthMap.set(key, entry);
  }
  const monthlyPnl = Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, data]) => ({
      month,
      pnl: parseFloat(data.pnl.toFixed(2)),
      trades: data.trades,
    }));

  return {
    totalTrades: trades.length,
    wins: winTrades.length,
    losses: lossTrades.length,
    winRate: parseFloat(((winTrades.length / trades.length) * 100).toFixed(1)),
    netPnl: parseFloat(netPnl.toFixed(2)),
    netPnlPct: parseFloat(((netPnl / initialBalance) * 100).toFixed(2)),
    grossProfit: parseFloat(grossProfit.toFixed(2)),
    grossLoss: parseFloat(grossLoss.toFixed(2)),
    avgWin: parseFloat(avgWin.toFixed(2)),
    avgLoss: parseFloat(avgLoss.toFixed(2)),
    profitFactor: grossLoss > 0 ? parseFloat((grossProfit / grossLoss).toFixed(2)) : 0,
    maxDrawdown: parseFloat(maxDrawdown.toFixed(2)),
    sharpeRatio: parseFloat(sharpeRatio.toFixed(2)),
    sortinoRatio: parseFloat(sortinoRatio.toFixed(2)),
    calmarRatio: parseFloat(calmarRatio.toFixed(3)),
    expectancy: parseFloat((netPnl / trades.length).toFixed(2)),
    avgDurationBars: parseFloat(avgDurationBars.toFixed(1)),
    maxConsecutiveWins: maxConsecWins,
    maxConsecutiveLosses: maxConsecLosses,
    monthlyPnl,
  };
}
