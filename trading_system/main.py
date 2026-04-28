"""
CLI entry point for the trading system generator.

Usage:
  python -m trading_system.main --prompt "สร้างระบบเทรด RSI โดยซื้อเมื่อ RSI ต่ำกว่า 30 ..."
  python -m trading_system.main --prompt "..." --live --user-id <supabase-uid>
  python -m trading_system.main --example rsi
  python -m trading_system.main --example macd
  python -m trading_system.main --example ema
"""
from __future__ import annotations

import argparse
import sys

from loguru import logger

from .generator import generate_trading_system, run_live

EXAMPLE_PROMPTS: dict[str, str] = {
    "rsi": (
        "สร้างระบบเทรด RSI โดยซื้อเมื่อ RSI ต่ำกว่า 30 และขายเมื่อ RSI สูงกว่า 70 "
        "พร้อม stop loss 2% และ take profit 5% บนคู่เงิน EURUSD timeframe H1"
    ),
    "macd": (
        "Create a MACD crossover strategy on GBPUSD with fast=12, slow=26, signal=9. "
        "Buy when MACD histogram crosses above zero, sell when it crosses below. "
        "Stop loss 1.5%, take profit 3%. Timeframe H4."
    ),
    "ema": (
        "EMA crossover system: buy when 9-period EMA crosses above 21-period EMA, "
        "sell when it crosses below. Use EURUSD, H1 timeframe. "
        "Stop loss 2%, take profit 4%. Risk 1% per trade."
    ),
    "bollinger": (
        "Bollinger Bands mean reversion on USDJPY H1. "
        "Buy when price closes below lower band, sell when price closes above upper band. "
        "Stop loss 1%, take profit 2%. Fixed lot size 0.01."
    ),
    "stochastic": (
        "Stochastic oscillator strategy: buy when %K and %D are both below 20 "
        "(oversold), sell when both are above 80 (overbought). "
        "EURUSD M15. Stop loss 1.5%, take profit 3%."
    ),
}


def _configure_logging(verbose: bool) -> None:
    logger.remove()
    level = "DEBUG" if verbose else "INFO"
    logger.add(
        sys.stderr,
        level=level,
        format="<green>{time:HH:mm:ss}</green> | <level>{level: <8}</level> | {message}",
    )
    logger.add(
        "trading_system.log",
        rotation="10 MB",
        retention="7 days",
        level="DEBUG",
        format="{time:YYYY-MM-DD HH:mm:ss} | {level} | {message}",
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate and run an automated trading system from a natural language prompt.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python -m trading_system.main --example rsi
  python -m trading_system.main --example macd --live
  python -m trading_system.main --prompt "RSI strategy on EURUSD H1, buy below 30, sell above 70, SL 2%, TP 5%"
  python -m trading_system.main --prompt "..." --user-id abc123 --balance 50000
        """,
    )

    parser.add_argument(
        "--prompt",
        type=str,
        default=None,
        help="Natural language description of the trading strategy (Thai or English).",
    )
    parser.add_argument(
        "--example",
        choices=list(EXAMPLE_PROMPTS.keys()),
        default=None,
        help=f"Use a built-in example prompt. Choices: {', '.join(EXAMPLE_PROMPTS)}",
    )
    parser.add_argument(
        "--live",
        action="store_true",
        default=False,
        help="Start live/paper trading after backtesting.",
    )
    parser.add_argument(
        "--user-id",
        type=str,
        default=None,
        dest="user_id",
        help="Supabase user UUID for persisting results to the dashboard.",
    )
    parser.add_argument(
        "--balance",
        type=float,
        default=10_000.0,
        help="Initial balance for backtesting in USD (default: 10000).",
    )
    parser.add_argument(
        "--candles",
        type=int,
        default=500,
        help="Number of historical candles to fetch for backtesting (default: 500).",
    )
    parser.add_argument(
        "--poll-interval",
        type=int,
        default=60,
        dest="poll_interval",
        help="Seconds between live trading poll cycles (default: 60).",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        default=False,
        help="Enable DEBUG-level logging.",
    )

    args = parser.parse_args()
    _configure_logging(args.verbose)

    if args.prompt is None and args.example is None:
        parser.print_help()
        print("\nError: provide either --prompt or --example")
        sys.exit(1)

    prompt = args.prompt or EXAMPLE_PROMPTS[args.example]

    logger.info("=" * 60)
    logger.info("Trading System Generator")
    logger.info("=" * 60)
    logger.info(f"Prompt: {prompt[:120]}{'...' if len(prompt) > 120 else ''}")

    system = generate_trading_system(
        prompt=prompt,
        user_id=args.user_id,
        initial_balance=args.balance,
        historical_candles=args.candles,
    )

    if system.strategy_id:
        logger.info(f"Strategy saved to Supabase: {system.strategy_id}")

    if args.live:
        logger.info("Starting live trading loop... Press Ctrl+C to stop.")
        run_live(
            system=system,
            poll_interval_seconds=args.poll_interval,
            user_id=args.user_id,
        )


if __name__ == "__main__":
    main()
