export type TradeSide = 'buy' | 'sell';
export type TradeStatus = 'open' | 'closed';

export interface PaperTrade {
  id: string;
  instrument: string;   // e.g. "EUR_USD"
  side: TradeSide;
  units: number;
  entry_price: number;
  exit_price: number | null;
  tp: number | null;
  sl: number | null;
  status: TradeStatus;
  opened_at: string;
  closed_at: string | null;
  pnl: number | null;
}

export interface PaperAccount {
  id: string;
  balance: number;
  currency: string;
  updated_at: string;
}

export interface OpenTradeForm {
  units: number;
  tp: string;   // string so empty input stays as ''
  sl: string;
}

export interface TradeHistoryFilters {
  instrument: string;   // '' means all
  dateFrom: string;     // ISO date string or ''
  dateTo: string;
}

export interface HistorySummary {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnl: number;
}

/** Instrument in OANDA underscore format → display label */
export const PAPER_INSTRUMENTS: Record<string, string> = {
  EUR_USD: 'EUR/USD',
  GBP_USD: 'GBP/USD',
  USD_JPY: 'USD/JPY',
  XAU_USD: 'XAU/USD',
};

/** Map from chart Instrument to useMarketData symbol key */
export function instrumentToSymbol(instrument: string): string {
  return instrument.replace('_', '');
}

/** Decimal precision for display */
export function priceDp(instrument: string): number {
  if (instrument === 'USD_JPY') return 3;
  if (instrument === 'XAU_USD') return 2;
  return 5;
}

/** P&L = (exit - entry) * units * direction */
export function calcPnl(
  side: TradeSide,
  entryPrice: number,
  exitPrice: number,
  units: number
): number {
  const direction = side === 'buy' ? 1 : -1;
  return parseFloat(((exitPrice - entryPrice) * units * direction).toFixed(2));
}

/** Unrealized P&L using current bid for longs, ask for shorts */
export function calcUnrealizedPnl(
  side: TradeSide,
  entryPrice: number,
  bid: number,
  ask: number,
  units: number
): number {
  const currentPrice = side === 'buy' ? bid : ask;
  return calcPnl(side, entryPrice, currentPrice, units);
}

export const PAPER_ACCOUNT_ID = '00000000-0000-0000-0000-000000000001';
