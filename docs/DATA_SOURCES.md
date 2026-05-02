# Data Sources Configuration Guide

This document provides detailed setup and configuration instructions for each data provider in Anjuna.

## Table of Contents

1. [EODHD Setup](#eodhd-setup)
2. [Tiingo Setup](#tiingo-setup)
3. [Synthetic Data Generator](#synthetic-data-generator)
4. [Cache Configuration](#cache-configuration)
5. [Troubleshooting](#troubleshooting)

## EODHD Setup

### What is EODHD?

EODHD (End of Day Historical Data) provides historical forex, stock, and crypto data with 60+ years of coverage. Perfect for comprehensive backtesting and long-term strategy analysis.

### Step-by-Step Setup

#### 1. Create an EODHD Account

1. Visit [eodhd.com](https://eodhd.com/register)
2. Sign up with your email address
3. Verify your email
4. Log in to your dashboard

#### 2. Get Your API Key

1. In your EODHD dashboard, navigate to **API Keys**
2. Copy your API key (looks like `abc123def456`)
3. Keep it safe — it's your access token to the API

#### 3. Configure in Anjuna

**Option A: Environment Variable (Recommended for Development)**

```bash
# Create .env.local in project root (never commit this)
REACT_APP_EODHD_API_KEY=your_api_key_here
```

Then restart your development server:

```bash
npm run dev
```

**Option B: Settings UI (Recommended for Production)**

1. Open Anjuna in your browser
2. Navigate to **Settings** > **Data Feed Config**
3. Under "Real Data Providers", find EODHD
4. Paste your API key in the input field
5. Click **Test Connection** to verify
6. API key is encrypted and stored in Supabase

### EODHD API Rate Limits

| Plan | Requests/Minute | Requests/Hour | Notes |
|------|-----------------|---------------|-------|
| Free | 120 | 2,000 | Perfect for development |
| Pro | 600 | 10,000 | Good for active trading |
| Enterprise | Unlimited | Unlimited | Contact for custom limits |

### Supported Instruments

EODHD covers thousands of instruments:

- **Forex**: EURUSD, GBPUSD, AUDJPY, etc. (1,000+ pairs)
- **Stocks**: US, Europe, Asia markets
- **Crypto**: Bitcoin, Ethereum, alt-coins
- **Commodities**: Oil, gold, metals

Use the EODHD ticker lookup at https://eodhd.com/financial-glossary/ticker-symbol to find specific symbols.

### Data Availability

- **Historical Depth**: Up to 60+ years (depending on instrument)
- **Timeframes**: 1-minute to daily OHLCV
- **Update Frequency**: Daily after US market close
- **Accuracy**: Adjusted for splits, dividends, distributions

### TTL and Caching

- **Cache TTL**: 30 days (configurable)
- **Refresh Strategy**: Automatic expiry after 30 days, manual refresh available
- **Storage**: IndexedDB (5 MB limit) + localStorage fallback

### Cost Estimation

```
Free tier: 120 requests/min = enough for ~200 backtests/day
Pro tier: $60/month = recommended for active development
```

## Tiingo Setup

### What is Tiingo?

Tiingo provides real-time and historical market data with 20+ years of coverage. Offers both REST API and WebSocket for live quotes.

### Step-by-Step Setup

#### 1. Create a Tiingo Account

1. Visit [tiingo.com](https://www.tiingo.com/account/signin)
2. Sign up with email
3. Verify your email
4. Log in to your account

#### 2. Get Your API Token

1. Go to **Account** > **API Tokens**
2. You'll see your default token (or create a new one)
3. Copy the token (looks like `abc123def456abc123`)
4. Keep it secure

#### 3. Configure in Anjuna

**Option A: Environment Variable (Development)**

```bash
# .env.local in project root
REACT_APP_TIINGO_API_KEY=your_token_here
```

Restart dev server:

```bash
npm run dev
```

**Option B: Settings UI (Production)**

1. Open **Settings** > **Data Feed Config**
2. Find Tiingo section
3. Enter your API token
4. Click **Test Connection**
5. Token stored securely in Supabase

### Tiingo API Rate Limits

| Plan | Requests/Hour | Concurrent | Notes |
|------|---------------|-----------|-------|
| Free | 500 | 1 | Good for learning |
| Starter | 5,000 | 5 | Great for development |
| Pro | 50,000+ | 10+ | For production apps |

### Supported Instruments

- **Stocks**: US markets (NYSE, NASDAQ)
- **Forex**: Major and minor pairs
- **Crypto**: Bitcoin, Ethereum, and others
- **Mutual Funds**: Tiingo-tracked funds

Look up symbols at https://www.tiingo.com/

### Real-Time Features

Unlike EODHD, Tiingo offers:

- **Real-Time Quotes**: Via WebSocket (ticker endpoints)
- **IEX Data**: Direct integration with IEX Cloud
- **Market Alerts**: Set up price alerts for symbols

Note: Real-time data is currently **not used** for backtesting (only historical), but available for live trading features.

### Data Availability

- **Historical Depth**: 20+ years for most instruments
- **Timeframes**: 1-minute to daily OHLCV
- **Update Frequency**: Real-time during market hours
- **Accuracy**: Clean, filtered, adjusted for corporate events

### TTL and Caching

- **Cache TTL**: 30 days (same as EODHD)
- **Refresh Strategy**: Manual or automatic expiry
- **Storage**: IndexedDB + localStorage

### Cost Estimation

```
Free tier: 500 requests/hour = ~10 backtests/hour
Starter ($10/month): Good for active development
```

## Synthetic Data Generator

### What is Synthetic Data?

Synthetic candles are procedurally generated using a consistent seed-based algorithm. Every time you request the same symbol + date range, you get identical data. This makes it perfect for testing and development.

### How It Works

The synthetic generator:

1. **Seeds randomness** with symbol + date hash
2. **Generates realistic OHLCV** with proper H > L constraints
3. **Simulates market behavior**: random walk, volatility clusters
4. **No dependencies**: Works offline, no API calls

### When to Use Synthetic Data

**Good use cases:**
- ✅ Development and testing (no API throttling)
- ✅ CI/CD pipelines (fast, no network)
- ✅ Emergency fallback (real providers unavailable)
- ✅ Testing edge cases (future dates, unusual ranges)
- ✅ Teaching or demos (no API key needed)

**Bad use cases:**
- ❌ Real trading (not real market data)
- ❌ Production backtests (unrealistic)
- ❌ Comparing with real performance

### Configuration

No setup required. Synthetic is the default fallback.

To force synthetic data explicitly:

```typescript
import { fetchOHLCV } from '@/services/dataFetchers/fetchOHLCV'

const result = await fetchOHLCV({
  symbol: 'EURUSD',
  startDate: new Date('2020-01-01'),
  endDate: new Date('2020-12-31'),
  provider: 'synthetic', // Force synthetic
  useCache: true,
})
```

### Automatic Fallback to Synthetic

The system automatically uses synthetic data when:

1. **Primary provider fails** (network error, auth error)
2. **Secondary provider fails** (both real providers down)
3. **Insufficient data**: Less than 50 real candles available

This ensures backtests never fail completely.

### Data Characteristics

Synthetic candles have:

- **Volatility**: ~2% daily standard deviation (forex-like)
- **Trends**: Random walk with drift
- **Patterns**: No real chart patterns (just random)
- **Volume**: Constant volume field
- **Gaps**: Occasional to simulate market openings

Example synthetic candle:

```json
{
  "timestamp": 1609459200000,
  "open": 1.2245,
  "high": 1.2312,
  "low": 1.2198,
  "close": 1.2287,
  "volume": 1000000,
  "symbol": "EURUSD",
  "provider": "synthetic"
}
```

### TTL and Caching

- **Cache TTL**: 30 days (same as real providers)
- **Storage**: IndexedDB + localStorage
- **Regeneration**: Same seed always produces same data

## Cache Configuration

### Understanding the Cache Layer

All data flows through a two-tier cache:

```
Request
  ↓
[IndexedDB] ← Tier 1 (fast, 5 MB limit)
  ↓ (miss)
[localStorage] ← Tier 2 (fallback, ~5 KB typical per entry)
  ↓ (miss)
[API] ← Tier 3 (network, slowest)
```

### Cache Settings

Edit cache configuration in `src/services/dataFetchers/fetchOHLCV.ts`:

```typescript
export interface FetchOHLCVConfig {
  primary_provider: ProviderType  // 'eodhd' | 'tiingo' | 'synthetic'
  cache_ttl_days: number          // How long to keep cached data
}

// Example: Set to 60-day cache
setFetchConfig({
  primary_provider: 'eodhd',
  cache_ttl_days: 60,
})
```

### Cache Keys

Cache keys follow the format:

```
${symbol}-${provider}-hourly
```

Examples:
- `EURUSD-eodhd-hourly` → EODHD data for EURUSD
- `AAPL-tiingo-hourly` → Tiingo data for AAPL
- `BTCUSD-synthetic-hourly` → Synthetic BTC data

### Manual Cache Operations

#### Check Cache Status

In Settings > Data Feed Config, view:
- Total entries cached
- Cache hit/miss ratio
- Oldest and newest cached data
- Storage used (bytes)

#### Refresh Cache

Click **Refresh Cache** to:
- Force re-fetch from provider
- Update cached data even if not expired
- Validate provider connectivity

#### Clear Cache

Click **Clear Cache** to:
- Remove all cached entries
- Free up storage space
- Trigger full re-fetch on next request

### Storage Limits

| Storage | Limit | Typical Data |
|---------|-------|--------------|
| IndexedDB | 5 MB | ~50 large backtests |
| localStorage | 5 KB per entry | ~20 small entries |
| Total | ~50 entries | Depends on size |

If storage fills up, older entries are automatically evicted (LRU).

### TTL Strategy

**Default: 30 days**

```
Day 0: Cache written, expires in 30 days
Day 15: Still cached, still valid
Day 30: Expired, will be re-fetched
Day 31: Fresh data from provider
```

Choose TTL based on your needs:

- **1 day**: Always fresh (maximum API usage)
- **7 days**: Balance freshness and usage
- **30 days**: (default) Minimize API calls
- **90 days**: Heavy caching, stale data possible

## Troubleshooting

### "API Key Invalid"

**Symptom**: Settings test shows "Authentication failed"

**Solutions**:
1. Copy API key again (no extra spaces)
2. Check your plan is active (not expired trial)
3. Verify key format matches provider (EODHD vs Tiingo differ)
4. Try a different date range (some symbols require subscription)

### "No Candles Returned"

**Symptom**: Backtest runs but shows 0 bars

**Causes & Solutions**:
- **Date range too narrow**: Try expanding to 6+ months
- **Symbol not supported**: Check provider's symbol list
- **Weekend/holiday**: Forex doesn't trade weekends
- **All providers failed**: Check internet, then use Synthetic

### "Rate Limited" Error

**Symptom**: "420 Too Many Requests" or similar

**Solutions**:
1. **Free tier**: Upgrade to paid plan or wait 1 hour
2. **Paid tier**: Contact provider support
3. **Workaround**: Use Synthetic data or expand cache TTL
4. **Optimization**: Reduce date range (fewer API calls)

### Cache Not Updating

**Symptom**: Backtest uses old data even after provider updates

**Solutions**:
1. Click **Refresh Cache** in Data Feed Config
2. Check if TTL has expired (30 days default)
3. Clear cache completely and retry
4. Check browser storage settings (private mode can prevent caching)

### "IndexedDB Not Available"

**Symptom**: Falls back to localStorage, slow performance

**Causes**:
- Private/Incognito mode
- Browser doesn't support IndexedDB
- Storage quota exceeded

**Solutions**:
1. Use normal browsing mode (not private)
2. Update browser to latest version
3. Clear old cache entries

### Provider Selection in Code

If you need to change the primary provider programmatically:

```typescript
import { setFetchConfig } from '@/services/dataFetchers/fetchOHLCV'

// Switch to Tiingo as primary
setFetchConfig({
  primary_provider: 'tiingo',
  cache_ttl_days: 30,
})

// Or revert to default
setFetchConfig({
  primary_provider: 'eodhd',
  cache_ttl_days: 30,
})
```

## References

- [EODHD API Documentation](https://eodhd.com/api)
- [Tiingo API Documentation](https://www.tiingo.com/documentation/api)
- [Forex Trading Basics](https://www.investopedia.com/terms/f/forex.asp)
- [OHLCV Candle Format](https://en.wikipedia.org/wiki/Candlestick_(Japanese_form_of_technical_analysis))

## FAQ

**Q: Can I use Synthetic data for real backtests?**
A: No. Synthetic data is for testing only. Always use real data (EODHD/Tiingo) for production backtests.

**Q: How do I get both APIs working?**
A: Set both API keys in Settings. The system will try EODHD first, then Tiingo, then Synthetic.

**Q: What if I don't have API keys?**
A: You can still backtest with Synthetic data, but results won't be realistic.

**Q: Can I change providers mid-backtest?**
A: No. Choose provider before running backtest. Changing during won't affect active run.

**Q: Is my API key safe?**
A: Yes. Keys are encrypted and stored in Supabase, never exposed in client code.

**Q: Can I request a custom cache TTL?**
A: Yes. Edit `cache_ttl_days` in `fetchOHLCV.ts` or contact support for per-user settings.
