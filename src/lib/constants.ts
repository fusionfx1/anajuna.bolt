export const FOREX_SYMBOLS = [
  'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD',
  'NZDUSD', 'USDCHF', 'EURGBP', 'EURJPY', 'GBPJPY',
  'AUDJPY', 'EURAUD', 'EURCHF', 'GBPCHF', 'XAUUSD',
];

export const BACKTEST_SYMBOLS = [
  'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'NZDUSD', 'EURGBP',
];

export const TIMEFRAMES = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'];

export const DEFAULT_RISK_SETTINGS = {
  riskPerTrade: 1.0,
  maxDailyLoss: 3.0,
  maxDrawdown: 5.0,
  defaultLotSize: 0.01,
  spreadFilterPips: 2.5,
  newsFilterMinutes: 5,
};

export const INITIAL_MARKET_PRICES: Record<string, number> = {
  EURUSD: 1.08542,
  GBPUSD: 1.26415,
  USDJPY: 153.24,
  AUDUSD: 0.65318,
  USDCAD: 1.36241,
  NZDUSD: 0.60812,
  USDCHF: 0.90115,
  EURGBP: 0.85732,
  EURJPY: 165.87,
  GBPJPY: 193.42,
  AUDJPY: 100.14,
  EURAUD: 1.65921,
  EURCHF: 0.97641,
  GBPCHF: 1.13892,
  XAUUSD: 2324.50,
};
