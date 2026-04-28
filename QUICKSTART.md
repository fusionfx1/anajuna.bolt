# Quickstart Guide — Anjuna Trading System

## Running the App

The dev server is running at **http://localhost:5173**

### Option 1: Test with Real Supabase Auth (Requires Email Confirmation)

1. Go to http://localhost:5173
2. Sign up with your email and password
3. Check your email for confirmation link
4. Click the confirmation link
5. Return to app and sign in

**Issue:** If you're behind a restrictive network, Supabase API calls may timeout.

### Option 2: Test with Dev Mode (Recommended for Local Testing)

If Supabase auth is not accessible from your network, use dev mode:

1. Open browser DevTools (F12)
2. Go to Console tab
3. Run this command:
```javascript
localStorage.setItem('devMode', 'true'); location.reload()
```
4. Page will reload and skip the login screen
5. Dashboard will be fully accessible

**Note:** Dev mode is for local development only. It bypasses all authentication.

## Current Status

✅ **Build:** Successful (1929 modules)
✅ **Dev Server:** Running on localhost:5173
✅ **Dashboard:** Ready to view
⚠️ **Auth:** Requires email confirmation or dev mode bypass

## What You Can Test

With the app loaded:
- **Dashboard** — View account metrics (currently $0 until broker configured)
- **Market Watch** — Real-time currency pair tracking
- **Strategies** — Create and manage trading strategies
- **Backtesting** — Run backtests (uses synthetic data by default)
- **Order Management** — Create paper trades
- **Settings** — Configure broker API keys (OANDA, Alpaca, etc.)

## Next Steps

1. **Configure Broker API** (Settings > MT5/Broker)
   - Add OANDA or Alpaca credentials to see real account data

2. **Test Critical Flows** (Settings > System Health)
   - Verify Data Feed status
   - Check Broker connection

3. **Run E2E Tests**
```bash
npm run test
```

## Troubleshooting

**"Blank page"?** → Dev server not running. Check `npm run dev`

**"Login stuck/timing out"?** → Network issue. Use dev mode instead.

**"Dashboard shows $0.00 for everything"?** → Expected until broker credentials are configured in Settings.

---

For full QA findings and bug tracking, see `.wolf/buglog.json` and `.wolf/cerebrum.md`
