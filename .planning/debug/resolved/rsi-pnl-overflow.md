---
status: resolved
trigger: "Investigate issue: rsi-pnl-overflow"
created: 2025-05-15T10:00:00Z
updated: 2025-05-15T10:27:00Z
---

## Current Focus

hypothesis: Possible calculation error in PnL logic or signal engine handling of trade exits.
test: Run the RSI example and examine the trade logs and PnL calculation code.
expecting: Identify where the massive negative PnL is coming from.
next_action: Run the RSI example to reproduce the issue.

## Symptoms

expected: Backtest results should be realistic and respect SL/TP and initial balance.
actual: Total PnL is $-21,551,401.19. Avg Loss is $-7,183,800.40.
errors: None in logs, but values are logically incorrect.
reproduction: Run `python -m trading_system.main --example rsi`
started: Discovered during initial test run of the trading system.

## Eliminated

## Evidence

- timestamp: 2025-05-15T10:10:00Z
  checked: trading_system/backtester.py
  found: _calculate_lot_size returns units (e.g., 5000) for FIXED_FRACTION, but _pnl_usd expects standard lots and multiplies by 100,000.
  implication: This leads to a double-counting of the lot size multiplier, resulting in PnL values being 100,000x larger than they should be when using FIXED_FRACTION position sizing.

## Resolution

root_cause: In `backtester.py`, `_calculate_lot_size` calculates position size in units but returns it as the `lot_size`. The `_pnl_usd` function then treats this value as standard lots and multiplies by 100,000 again to calculate the PnL in USD.
fix: Divided the result of `_calculate_lot_size` by 100,000 when using `FIXED_FRACTION` method to ensure it returns standard lots.
verification: Running `python -m trading_system.main --example rsi` now yields realistic PnL values (e.g., $-116.68 on a $10,000 balance instead of millions).
files_changed: [trading_system/backtester.py]
