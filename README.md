# Anjuna Automated Forex Trading Dashboard

An advanced forex trading platform with real-time data providers, backtesting engine, and AI-powered signal generation.

## Features

- **Multi-Provider Data Pipeline**: Real data from EODHD and Tiingo, with intelligent fallback to synthetic data
- **Advanced Backtesting**: Test strategies across multiple instruments with comprehensive metrics
- **Paper Trading**: Risk-free strategy validation with simulated positions
- **Risk Management**: Circuit breakers, position sizing, and account-level risk monitoring
- **AI Engine**: Multi-provider signal fusion (News, Fred, Sentiment, Technical)
- **Real-Time Monitoring**: Live order management, trade history, and system health dashboard

## Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn
- Supabase project (for authentication and data storage)
- Vite development server

### Installation

```bash
npm install
npm run dev
```

Open http://localhost:5173 in your browser.

### Build for Production

```bash
npm run build
npm run preview
```

## Data Providers

The backtesting and live trading systems support **three data providers** with an intelligent fallback chain:

### Provider Overview

| Provider | Type | Coverage | Real-Time | Fallback Role |
|----------|------|----------|-----------|---------------|
| **EODHD** | REST API | 60+ years, 1-min to daily | No | Primary option |
| **Tiingo** | REST API | 20+ years, 1-min to daily | Yes | Secondary option |
| **Synthetic** | Generated | Any date range, 1-min to daily | No | Emergency fallback |

### EODHD (End of Day Historical Data)

- **Coverage**: Forex pairs, stocks, crypto (60+ years of historical data)
- **Timeframes**: 1-minute to daily OHLCV candles
- **Setup**:
  1. Sign up at [eodhd.com](https://eodhd.com)
  2. Obtain your API key from the dashboard
  3. Set environment variable: `REACT_APP_EODHD_API_KEY=your_key_here`
- **Rate Limits**: 120 requests/minute (free tier), higher on paid plans
- **TTL**: 30 days (refreshable cache)
- **Advantages**: Decades of historical data, very reliable
- **Disadvantages**: No real-time data, requires API key

### Tiingo

- **Coverage**: Stocks, forex, crypto (20+ years of historical data)
- **Timeframes**: 1-minute to daily OHLCV candles
- **Setup**:
  1. Sign up at [tiingo.com](https://tiingo.com)
  2. Obtain your API key from account settings
  3. Set environment variable: `REACT_APP_TIINGO_API_KEY=your_key_here`
- **Rate Limits**: 500 requests/hour (free tier), higher on paid plans
- **TTL**: 30 days (refreshable cache)
- **Advantages**: Real-time data available, good coverage
- **Disadvantages**: Shorter historical depth than EODHD

### Synthetic Data Generator

- **Coverage**: Any symbol, any date range
- **Timeframes**: 1-minute to daily OHLCV candles
- **Algorithm**: Procedural generation using seed-based randomness for consistent results
- **No Setup Required**: Works out of the box
- **Use Cases**:
  - Emergency fallback when real providers fail
  - Testing with unusual date ranges (future/past edge cases)
  - Development and CI/CD testing
- **Limitations**: Not suitable for production trading (not real market data)
- **Threshold**: Automatically triggered when real provider has < 50 candles

## Data Fetching Pipeline

### Request Flow

```
User Request
    ↓
[Cache Layer] ← Try IndexedDB first
    ↓ (miss)
[Primary Provider] ← Try EODHD or Tiingo (based on config)
    ↓ (fail)
[Secondary Provider] ← Try the other real provider
    ↓ (fail)
[Synthetic Fallback] ← Generate consistent test data
    ↓
[Cache Update] ← Store successful result for 30 days
    ↓
Response to User
```

### Type Definitions

All candle data flows through these types:

**RawOHLCV** (provider-specific format)
```typescript
{
  timestamp: number // Unix ms
  open: number
  high: number
  low: number
  close: number
  volume: number
}
```

**NormalizedCandle** (unified format)
```typescript
{
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume: number
  symbol: string
  provider: 'eodhd' | 'tiingo' | 'synthetic'
}
```

### Cache Strategy

- **Storage**: IndexedDB (primary) + localStorage (fallback)
- **TTL**: 30 days (configurable via `cache_ttl_days`)
- **Invalidation**: Manual refresh or TTL expiry
- **Size Limit**: 5 MB per browser storage
- **Key Format**: `${symbol}-${provider}-hourly`

## Configuration

### Environment Variables

```bash
# Supabase
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key

# Data Providers (optional, but recommended for real data)
REACT_APP_EODHD_API_KEY=your_eodhd_key
REACT_APP_TIINGO_API_KEY=your_tiingo_key

# Application
VITE_APP_NAME=Anjuna
VITE_API_BASE_URL=http://localhost:3000
```

### Runtime Configuration

Access the **Data Feed Config** in Settings to:
- Select primary data provider
- Configure API keys (stored securely in Supabase)
- Test provider connectivity
- View cache statistics

## Backtesting

Run backtests against any symbol with any data provider:

1. Navigate to **Backtesting** > **New Backtest**
2. Select:
   - Symbol (EURUSD, AUDJPY, etc.)
   - Date range (any historical or future period)
   - Strategy (predefined or custom)
   - Data provider (EODHD, Tiingo, or Synthetic)
3. Click **Run** to start the backtest
4. View results: Equity curve, metrics, and trade log

### Backtest Metrics

- **Total Return**: Absolute P&L from start to finish
- **Sharpe Ratio**: Risk-adjusted return
- **Max Drawdown**: Largest peak-to-trough decline
- **Win Rate**: Percentage of profitable trades
- **Profit Factor**: Gross profit / Gross loss

### Multi-Provider Comparison

Compare the same backtest across all three providers:
1. Run backtest with EODHD
2. Run same config with Tiingo
3. Run same config with Synthetic
4. Use **Comparison View** to see metrics side-by-side

## Paper Trading

Test strategies in a simulated account with real market prices:

1. Configure **Paper Trading** in Data Feed Config
2. Create paper positions manually or via strategy signals
3. Monitor open positions, P&L, and risk metrics
4. Close positions to realize gains/losses
5. View trade history and performance analytics

## Project Structure

```
src/
├── components/          # React components
│   ├── Backtesting.tsx  # Backtest UI
│   ├── ChartPage.tsx    # Chart and technical analysis
│   ├── Dashboard.tsx    # Main dashboard
│   └── ...
├── services/            # Business logic
│   ├── dataFetchers/    # Data provider clients
│   │   ├── fetchOHLCV.ts    # Main fetch orchestrator
│   │   ├── types.ts         # Type definitions
│   │   └── synthetic.ts     # Synthetic data generator
│   ├── backtestEngine.ts    # Backtest execution
│   ├── cache.ts             # IndexedDB + localStorage
│   ├── normalize.ts         # Data normalization
│   └── ...
├── types/               # TypeScript interfaces
├── hooks/               # Custom React hooks
└── lib/                 # Utilities (Supabase, etc.)

supabase/
├── functions/           # Edge functions (data proxies)
├── migrations/          # Database schema
└── seed-*.sql           # Initial data

tests/                   # Unit and integration tests
e2e/                     # Playwright E2E tests
```

## Architecture

### Data Normalization

Raw data from providers comes in different formats. The system normalizes everything to `NormalizedCandle`:

1. **Fetch**: Get raw OHLCV from provider (RawOHLCV)
2. **Normalize**: Convert to standard format (NormalizedCandle)
3. **Deduplicate**: Remove duplicate timestamps
4. **Sort**: Ensure chronological order
5. **Cache**: Store normalized data for 30 days
6. **Use**: Feed to backtester, charting, and strategies

### Fallback Chain Logic

If the primary provider fails:

1. Check what error occurred (auth, network, empty response)
2. Try the next provider in sequence
3. If all fail and we have < 50 candles, use Synthetic
4. Cache the successful result (or synthetic result) separately
5. Log the failure and provider used for debugging

### Real-Time Data vs. Historical

- **Backtesting**: Uses historical candles from providers or synthetic
- **Paper Trading**: Uses simulated real-time ticks based on latest cached candles
- **Live Trading**: (Not yet implemented) would connect to real broker APIs

## Testing

### Unit Tests

```bash
npm run test
```

### E2E Tests

```bash
npm run build  # Must build first
npm run e2e
npm run e2e:report  # View last test report
```

**Note**: E2E tests use a development server on http://localhost:4173

## Security

- **API Keys**: Stored securely in Supabase (never in client code)
- **Authentication**: Supabase Auth with email/password
- **Authorization**: Row-level security (RLS) on database tables
- **Validation**: Input validation on all user-facing APIs

## Troubleshooting

### "Failed to fetch from all providers"
- Check API keys in Settings
- Verify internet connection
- Check provider status pages
- Try a different date range

### Cache is stale
- Click "Refresh Cache" in Data Feed Config
- Cache auto-refreshes after 30 days
- Manual clear button available in Settings

### Synthetic data being used in backtest
- Occurs when primary + secondary providers both fail
- Provides at least 1 year of consistent synthetic data
- Check logs for which provider failed and why

## Support

- **Issues**: Report bugs or feature requests
- **Documentation**: See `docs/` folder
- **Data Sources**: See `docs/DATA_SOURCES.md` for detailed provider setup
- **Architecture**: See this README's Architecture section

## License

MIT
