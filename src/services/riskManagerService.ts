import type { ManagedOrder, RiskCheckResult, PositionSizeResult } from '../types/dataFeed';

export interface RiskParameters {
  maxPositionPct: number;
  maxDailyLossPct: number;
  maxDrawdownPct: number;
  maxSingleTradePct: number;
  maxOpenPositions: number;
  allowedSymbols: string[];
  tradingHaltActive: boolean;
}

export interface AccountState {
  equity: number;
  balance: number;
  peakEquity: number;
  dailyPnl: number;
  openPositionsCount: number;
  openSymbols: string[];
}

const DEFAULT_PARAMS: RiskParameters = {
  maxPositionPct: 0.05,
  maxDailyLossPct: 0.03,
  maxDrawdownPct: 0.08,
  maxSingleTradePct: 0.01,
  maxOpenPositions: 10,
  allowedSymbols: ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'NZDUSD', 'USDCHF', 'EURGBP'],
  tradingHaltActive: false,
};

class RiskManagerService {
  private params: RiskParameters = { ...DEFAULT_PARAMS };

  updateParameters(params: Partial<RiskParameters>): void {
    this.params = { ...this.params, ...params };
  }

  getParameters(): RiskParameters {
    return { ...this.params };
  }

  approve(order: ManagedOrder, currentPrice: number, accountState: AccountState): RiskCheckResult {
    const checks: RiskCheckResult['checks'] = [];

    if (this.params.tradingHaltActive) {
      checks.push({
        name: 'Trading Halt',
        passed: false,
        detail: 'All trading has been halted by the risk system',
      });
      return { approved: false, reason: 'Trading halt is active', checks };
    }
    checks.push({ name: 'Trading Halt', passed: true, detail: 'No halt active' });

    const tradeValue = order.quantity * currentPrice;
    const tradePct = tradeValue / accountState.equity;
    const tradePassed = tradePct <= this.params.maxSingleTradePct;
    checks.push({
      name: 'Single Trade Size',
      passed: tradePassed,
      detail: `Trade size ${(tradePct * 100).toFixed(2)}% of equity (max ${(this.params.maxSingleTradePct * 100).toFixed(2)}%)`,
    });

    const dailyLossPct = accountState.dailyPnl / accountState.balance;
    const dailyPassed = dailyLossPct > -this.params.maxDailyLossPct;
    checks.push({
      name: 'Daily Loss Limit',
      passed: dailyPassed,
      detail: `Daily P&L: ${(dailyLossPct * 100).toFixed(2)}% (limit: -${(this.params.maxDailyLossPct * 100).toFixed(2)}%)`,
    });

    const drawdown = (accountState.peakEquity - accountState.equity) / accountState.peakEquity;
    const drawdownPassed = drawdown <= this.params.maxDrawdownPct;
    checks.push({
      name: 'Max Drawdown',
      passed: drawdownPassed,
      detail: `Drawdown: ${(drawdown * 100).toFixed(2)}% (max: ${(this.params.maxDrawdownPct * 100).toFixed(2)}%)`,
    });

    const positionPassed = accountState.openPositionsCount < this.params.maxOpenPositions;
    checks.push({
      name: 'Max Open Positions',
      passed: positionPassed,
      detail: `Open positions: ${accountState.openPositionsCount} (max: ${this.params.maxOpenPositions})`,
    });

    const symbolAllowed = this.params.allowedSymbols.length === 0 || this.params.allowedSymbols.includes(order.symbol);
    checks.push({
      name: 'Symbol Allowed',
      passed: symbolAllowed,
      detail: symbolAllowed ? `${order.symbol} is on the allowed list` : `${order.symbol} is not in the allowed symbols list`,
    });

    const allPassed = checks.every(c => c.passed);
    const failedCheck = checks.find(c => !c.passed);

    return {
      approved: allPassed,
      reason: failedCheck?.detail,
      checks,
    };
  }

  calculatePositionSize(
    accountEquity: number,
    riskPct: number,
    entryPrice: number,
    stopLossPrice: number
  ): PositionSizeResult {
    const dollarRisk = accountEquity * riskPct;
    const priceRiskPerUnit = Math.abs(entryPrice - stopLossPrice);

    if (priceRiskPerUnit === 0) {
      return {
        quantity: 0,
        dollarRisk,
        priceRiskPerUnit: 0,
        accountEquity,
        riskPct,
      };
    }

    const quantity = parseFloat((dollarRisk / priceRiskPerUnit).toFixed(2));
    return {
      quantity,
      dollarRisk: parseFloat(dollarRisk.toFixed(2)),
      priceRiskPerUnit: parseFloat(priceRiskPerUnit.toFixed(5)),
      accountEquity,
      riskPct,
    };
  }

  calculateKellySize(
    accountEquity: number,
    winRate: number,
    avgWin: number,
    avgLoss: number,
    fractionCap = 0.25
  ): number {
    if (avgLoss === 0 || winRate <= 0 || winRate >= 1) return 0;
    const lossRate = 1 - winRate;
    const ratio = avgWin / Math.abs(avgLoss);
    const kelly = winRate - lossRate / ratio;
    const fraction = Math.min(Math.max(kelly, 0), fractionCap);
    return parseFloat((accountEquity * fraction).toFixed(2));
  }

  assessPortfolioRisk(openPositions: { symbol: string; notional: number }[], accountEquity: number): {
    totalExposure: number;
    exposurePct: number;
    concentrationRisk: boolean;
    largestPosition: string;
    largestPositionPct: number;
  } {
    const totalNotional = openPositions.reduce((s, p) => s + p.notional, 0);
    const exposurePct = accountEquity > 0 ? totalNotional / accountEquity : 0;

    const largest = openPositions.reduce(
      (max, p) => p.notional > max.notional ? p : max,
      { symbol: '', notional: 0 }
    );
    const largestPct = accountEquity > 0 ? largest.notional / accountEquity : 0;

    return {
      totalExposure: parseFloat(totalNotional.toFixed(2)),
      exposurePct: parseFloat((exposurePct * 100).toFixed(2)),
      concentrationRisk: largestPct > this.params.maxPositionPct,
      largestPosition: largest.symbol,
      largestPositionPct: parseFloat((largestPct * 100).toFixed(2)),
    };
  }
}

export const riskManager = new RiskManagerService();
