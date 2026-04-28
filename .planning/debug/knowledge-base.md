# GSD Debug Knowledge Base

Resolved debug sessions. Used by `gsd-debugger` to surface known-pattern hypotheses at the start of new investigations.

---

## rsi-pnl-overflow — RSI example backtest shows impossible PnL (-$21M on $10k balance)
- **Date:** 2025-05-15
- **Error patterns:** PnL overflow, impossible PnL, FIXED_FRACTION, backtest
- **Root cause:** In `backtester.py`, `_calculate_lot_size` calculates position size in units but returns it as the `lot_size`. The `_pnl_usd` function then treats this value as standard lots and multiplies by 100,000 again to calculate the PnL in USD.
- **Fix:** Divided the result of `_calculate_lot_size` by 100,000 when using `FIXED_FRACTION` method to ensure it returns standard lots.
- **Files changed:** trading_system/backtester.py
---
