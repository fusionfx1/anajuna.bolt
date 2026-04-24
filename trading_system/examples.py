"""
examples.py — ตัวอย่างการใช้งาน generate_trading_system()

วิธีรัน:
  python -m trading_system.examples

แต่ละตัวอย่างแสดงให้เห็น:
  1. การสร้างระบบเทรดจาก prompt ภาษาไทย
  2. การสร้างระบบเทรดจาก prompt ภาษาอังกฤษ
  3. การปรับแต่ง StrategyConfig ด้วยตนเองก่อน backtest
  4. การบันทึกผลลัพธ์ลง Supabase (ต้องมี user_id)
  5. การเริ่ม live/paper trading หลัง backtest
"""
from __future__ import annotations

import os
import sys

import pandas as pd
from loguru import logger

logger.remove()
logger.add(sys.stderr, level="INFO", format="<green>{time:HH:mm:ss}</green> | <level>{level: <8}</level> | {message}")


# ---------------------------------------------------------------------------
# Example 1: RSI Strategy (Thai Prompt)
# ---------------------------------------------------------------------------
def example_rsi_thai() -> None:
    print("\n" + "=" * 60)
    print("Example 1: RSI Strategy — Thai Prompt")
    print("=" * 60)

    from .generator import generate_trading_system

    system = generate_trading_system(
        prompt=(
            "สร้างระบบเทรด RSI โดยซื้อเมื่อ RSI ต่ำกว่า 30 และขายเมื่อ RSI สูงกว่า 70 "
            "พร้อม stop loss 2% และ take profit 5% บนคู่เงิน EURUSD timeframe H1"
        ),
        initial_balance=10_000.0,
    )

    print(f"\nStrategy Name : {system.config.name}")
    print(f"Indicator     : {system.config.indicator.indicator_type.value.upper()}")
    print(f"Symbol        : {system.config.symbols}")
    print(f"Timeframe     : {system.config.timeframe}")
    print(f"Buy Threshold : RSI < {system.config.signal_condition.buy_threshold}")
    print(f"Sell Threshold: RSI > {system.config.signal_condition.sell_threshold}")
    print(f"Stop Loss     : {system.config.stop_loss_pct:.1%}")
    print(f"Take Profit   : {system.config.take_profit_pct:.1%}")

    if system.backtest_result:
        print("\n" + system.backtest_result.summary())


# ---------------------------------------------------------------------------
# Example 2: MACD Strategy (English Prompt)
# ---------------------------------------------------------------------------
def example_macd_english() -> None:
    print("\n" + "=" * 60)
    print("Example 2: MACD Strategy — English Prompt")
    print("=" * 60)

    from .generator import generate_trading_system

    system = generate_trading_system(
        prompt=(
            "Create a MACD crossover trend-following strategy on GBPUSD H4. "
            "Buy when MACD histogram turns positive (crosses above zero), "
            "sell when MACD histogram turns negative. "
            "Stop loss 1.5%, take profit 4.5%. Risk 1% per trade."
        ),
        initial_balance=50_000.0,
    )

    if system.backtest_result:
        print("\n" + system.backtest_result.summary())


# ---------------------------------------------------------------------------
# Example 3: EMA Cross + Manual Config Adjustment
# ---------------------------------------------------------------------------
def example_ema_custom_config() -> None:
    print("\n" + "=" * 60)
    print("Example 3: EMA Cross with Manual Config Adjustment")
    print("=" * 60)

    from .prompt_parser import parse_prompt
    from .backtester import run_backtest
    from .broker import PaperConnector

    config = parse_prompt(
        "EMA crossover on EURUSD H1: buy when fast EMA crosses above slow EMA, "
        "sell when it crosses below. Stop loss 2%, take profit 5%."
    )

    config.lot_size = 0.05
    config.max_concurrent_trades = 2
    config.risk_per_trade_pct = 0.015

    print(f"Config name   : {config.name}")
    print(f"Lot size      : {config.lot_size}")
    print(f"Max trades    : {config.max_concurrent_trades}")
    print(f"Risk per trade: {config.risk_per_trade_pct:.1%}")

    broker = PaperConnector(initial_balance=25_000.0)
    df = broker.get_candles("EURUSD", "H1", count=400)

    result = run_backtest(df, config, initial_balance=25_000.0)
    print("\n" + result.summary())


# ---------------------------------------------------------------------------
# Example 4: Bollinger Bands Strategy
# ---------------------------------------------------------------------------
def example_bollinger() -> None:
    print("\n" + "=" * 60)
    print("Example 4: Bollinger Bands Mean Reversion")
    print("=" * 60)

    from .generator import generate_trading_system

    system = generate_trading_system(
        prompt=(
            "Bollinger Bands mean reversion strategy on USDJPY H1. "
            "Buy when price closes below the lower Bollinger Band (2 std), "
            "sell when price closes above the upper band. "
            "Stop loss 1%, take profit 2%. Fixed lot 0.01."
        ),
        initial_balance=10_000.0,
    )

    if system.backtest_result:
        print("\n" + system.backtest_result.summary())


# ---------------------------------------------------------------------------
# Example 5: Stochastic Oscillator Strategy
# ---------------------------------------------------------------------------
def example_stochastic() -> None:
    print("\n" + "=" * 60)
    print("Example 5: Stochastic Oscillator")
    print("=" * 60)

    from .generator import generate_trading_system

    system = generate_trading_system(
        prompt=(
            "Stochastic oscillator strategy on AUDUSD M15. "
            "Buy when %K and %D both cross below 20 (oversold), "
            "sell when both are above 80 (overbought). "
            "Stop loss 1.5%, take profit 3%."
        ),
        initial_balance=10_000.0,
    )

    if system.backtest_result:
        print("\n" + system.backtest_result.summary())


# ---------------------------------------------------------------------------
# Example 6: Inspect Signals Manually
# ---------------------------------------------------------------------------
def example_inspect_signals() -> None:
    print("\n" + "=" * 60)
    print("Example 6: Inspect Generated Signals Manually")
    print("=" * 60)

    from .prompt_parser import parse_prompt
    from .signal_engine import generate_signals
    from .broker import PaperConnector

    config = parse_prompt(
        "RSI strategy: buy below 30, sell above 70. EURUSD H1. SL 2%, TP 5%."
    )
    broker = PaperConnector()
    df = broker.get_candles("EURUSD", "H1", count=300)
    signals = generate_signals(df, config)

    print(f"\nTotal signals generated: {len(signals)}")
    buy_signals = [s for s in signals if s.signal_type.value == "BUY"]
    sell_signals = [s for s in signals if s.signal_type.value == "SELL"]
    print(f"  BUY  signals: {len(buy_signals)}")
    print(f"  SELL signals: {len(sell_signals)}")

    if signals:
        print("\nFirst 5 signals:")
        for sig in signals[:5]:
            print(
                f"  [{sig.timestamp.strftime('%Y-%m-%d %H:%M')}] "
                f"{sig.signal_type.value:4s} | price={sig.price:.5f} | "
                f"RSI={sig.indicator_value:.2f}"
            )


# ---------------------------------------------------------------------------
# Example 7: Paper Trading (limited iterations, offline)
# ---------------------------------------------------------------------------
def example_paper_trading() -> None:
    print("\n" + "=" * 60)
    print("Example 7: Paper Trading (5 iterations, offline)")
    print("=" * 60)

    from .generator import generate_trading_system, run_live
    from .broker import PaperConnector

    system = generate_trading_system(
        prompt="RSI strategy: buy below 30, sell above 70. EURUSD H1. SL 2%, TP 5%."
    )

    broker = PaperConnector(initial_balance=10_000.0)
    print("\nRunning 5 live-loop iterations (poll_interval=0s for demo)...")
    run_live(
        system=system,
        broker=broker,
        poll_interval_seconds=0,
        max_iterations=5,
    )
    acct = broker.get_account()
    print(f"\nFinal paper account equity: ${acct.equity:,.2f}")


# ---------------------------------------------------------------------------
# Main runner
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    examples = [
        ("RSI Thai Prompt",       example_rsi_thai),
        ("MACD English",          example_macd_english),
        ("EMA Custom Config",     example_ema_custom_config),
        ("Bollinger Bands",       example_bollinger),
        ("Stochastic",            example_stochastic),
        ("Inspect Signals",       example_inspect_signals),
        ("Paper Trading",         example_paper_trading),
    ]

    for name, fn in examples:
        try:
            fn()
        except Exception as exc:
            print(f"\n[SKIP] {name}: {exc}")
