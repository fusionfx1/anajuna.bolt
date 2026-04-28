"""
generate_trading_system: Top-level orchestrator.

Takes a natural language prompt, produces a fully configured TradingSystem
with backtest results persisted to Supabase, ready for live execution.
"""
from __future__ import annotations

import dataclasses
import os
import time
from datetime import datetime, timezone
from typing import Optional

import pandas as pd
from dotenv import load_dotenv
from loguru import logger

from .backtester import run_backtest
from .broker import BrokerConnector, CircuitBreaker, OandaConnector, OrderRequest, PaperConnector
from .models import BacktestResult, OrderSide, SignalType, StrategyConfig, TradingSystem
from .prompt_parser import parse_prompt
from .signal_providers import signal_provider_from_env

load_dotenv()


def _build_broker(config: StrategyConfig) -> BrokerConnector:
    account_id = os.environ.get("OANDA_ACCOUNT_ID", "")
    api_token = os.environ.get("OANDA_API_TOKEN", "")
    account_type = os.environ.get("OANDA_ACCOUNT_TYPE", "practice")

    if account_id and api_token:
        logger.info("Using OANDA broker connector")
        return OandaConnector(account_id, api_token, account_type)

    logger.info("OANDA credentials not found — using Paper Trading connector")
    return PaperConnector(initial_balance=10_000.0)


def _fetch_historical_data(broker: BrokerConnector, config: StrategyConfig, count: int = 500) -> pd.DataFrame:
    symbol = config.symbols[0]
    logger.info(f"Fetching {count} candles for {symbol} / {config.timeframe}")
    df = broker.get_candles(symbol, config.timeframe, count=count)
    if df.empty:
        raise RuntimeError(f"No historical data returned for {symbol} {config.timeframe}")
    return df


def _persist_results(
    result: BacktestResult,
    user_id: Optional[str],
) -> Optional[str]:
    if not user_id:
        logger.info("No user_id provided — skipping Supabase persistence")
        return None

    try:
        from .supabase_client import SupabaseClient
        db = SupabaseClient(user_id)

        strategy_id = db.save_strategy(result.config.to_supabase_dict())
        result.strategy_id = strategy_id

        serialised_trades = [
            {
                "symbol": t.symbol,
                "side": t.side.value,
                "entry_price": t.entry_price,
                "exit_price": t.exit_price,
                "lot_size": t.lot_size,
                "stop_loss": t.stop_loss,
                "take_profit": t.take_profit,
                "entry_time": t.entry_time.isoformat(),
                "exit_time": t.exit_time.isoformat(),
                "pnl_usd": t.pnl_usd,
                "pnl_pips": t.pnl_pips,
                "exit_reason": t.exit_reason,
            }
            for t in result.trades
        ]

        if serialised_trades:
            db.save_backtest_trades(strategy_id, serialised_trades)

        if result.equity_curve:
            db.save_equity_snapshots(result.equity_curve[::5])

        db.update_strategy_stats(
            strategy_id,
            total_trades=result.total_trades,
            win_rate=result.win_rate,
            total_pnl_usd=result.total_pnl_usd,
            sharpe_ratio=result.sharpe_ratio,
            status="backtesting",
        )

        logger.info(f"All results persisted. Strategy ID: {strategy_id}")
        return strategy_id

    except Exception as exc:
        logger.error(f"Supabase persistence failed: {exc}")
        return None


def generate_trading_system(
    prompt: str,
    user_id: Optional[str] = None,
    initial_balance: float = 10_000.0,
    historical_candles: int = 500,
    broker: Optional[BrokerConnector] = None,
) -> TradingSystem:
    """
    Parse a natural language prompt and produce a fully backtested TradingSystem.

    Parameters
    ----------
    prompt : str
        Natural language description of the trading strategy (Thai or English).
    user_id : str, optional
        Supabase user UUID. If provided, results are persisted to the dashboard.
        If None, the system runs fully offline.
    initial_balance : float
        Starting balance used for the backtest simulation (USD).
    historical_candles : int
        Number of historical candles to fetch for backtesting.
    broker : BrokerConnector, optional
        Custom broker connector. Auto-detected from environment variables if None.

    Returns
    -------
    TradingSystem
        A fully configured system with backtest results attached.
        Call run_live(system) to start live/paper trading.

    Examples
    --------
    >>> system = generate_trading_system(
    ...     "สร้างระบบเทรด RSI โดยซื้อเมื่อ RSI ต่ำกว่า 30 "
    ...     "และขายเมื่อ RSI สูงกว่า 70 พร้อม stop loss 2% และ take profit 5%"
    ... )
    >>> print(system.backtest_result.summary())
    """
    logger.info(f"Generating trading system from prompt: {prompt[:80]}...")

    config: StrategyConfig = parse_prompt(prompt)
    logger.info(
        f"Parsed strategy: {config.name} | {config.indicator.indicator_type.value.upper()} | "
        f"SL={config.stop_loss_pct:.1%} TP={config.take_profit_pct:.1%}"
    )

    active_broker = broker or _build_broker(config)

    df = _fetch_historical_data(active_broker, config, count=historical_candles)
    logger.info(f"Fetched {len(df)} candles from {df.index[0]} to {df.index[-1]}")

    result = run_backtest(df, config, initial_balance=initial_balance)
    logger.info(
        f"Backtest complete: {result.total_trades} trades | "
        f"WR={result.win_rate:.1%} | PnL=${result.total_pnl_usd:,.2f} | "
        f"Sharpe={result.sharpe_ratio:.3f}"
    )

    strategy_id = _persist_results(result, user_id)

    system = TradingSystem(
        config=config,
        backtest_result=result,
        strategy_id=strategy_id,
        is_live=False,
    )

    print(result.summary())
    return system


def run_live(
    system: TradingSystem,
    broker: Optional[BrokerConnector] = None,
    poll_interval_seconds: int = 60,
    user_id: Optional[str] = None,
    max_iterations: Optional[int] = None,
) -> None:
    """
    Start a live (or paper) trading loop for the given TradingSystem.

    On each poll interval the loop:
      1. Fetches the latest candles from the broker
      2. Evaluates the signal engine on the last candle
      3. Checks circuit breakers
      4. Submits an order if a BUY or SELL signal fires
      5. Logs risk events to Supabase if user_id is provided

    Parameters
    ----------
    system : TradingSystem
        A system returned by generate_trading_system().
    broker : BrokerConnector, optional
        Connector to use. Auto-detected from environment if None.
    poll_interval_seconds : int
        Seconds between each candle fetch + signal evaluation cycle.
    user_id : str, optional
        If provided, risk events are written to Supabase.
    max_iterations : int, optional
        Stop after this many iterations (useful for testing). None = run forever.

    Environment
    -----------
    SIGNAL_MODE : str, optional
        ``rules`` (default) uses indicator rules via ``get_latest_signal``.
        ``agent`` uses the CrewAI stub agent layer + fusion (see ``signal_providers``).

    Notes
    -----
    Press Ctrl+C to stop the loop gracefully.
    """
    config = system.config
    active_broker = broker or _build_broker(config)

    db = None
    if user_id:
        try:
            from .supabase_client import SupabaseClient
            db = SupabaseClient(user_id)
        except Exception as exc:
            logger.warning(f"Supabase unavailable for live logging: {exc}")

    settings = db.get_user_settings() if db else None
    signal_provider = signal_provider_from_env()

    circuit = CircuitBreaker(
        max_daily_loss_pct=float(settings.get("max_daily_loss_pct", 3.0)) / 100
        if settings
        else 0.03,
        max_drawdown_pct=float(settings.get("max_drawdown_pct", 8.0)) / 100
        if settings
        else 0.08,
        halt_overnight=bool(settings.get("cb_overnight_hold", False)) if settings else False,
    )

    symbol = config.symbols[0]
    system.is_live = True
    daily_pnl = 0.0
    peak_equity = 0.0
    iteration = 0

    logger.info(
        f"Live loop started: {config.name} | {symbol} | {config.timeframe} | "
        f"interval={poll_interval_seconds}s | SIGNAL_MODE={os.environ.get('SIGNAL_MODE', 'rules')}"
    )

    try:
        while True:
            if max_iterations is not None and iteration >= max_iterations:
                logger.info(f"Reached max_iterations={max_iterations}. Stopping.")
                break

            iteration += 1
            logger.debug(f"[iter {iteration}] polling {symbol}...")

            try:
                df = active_broker.get_candles(symbol, config.timeframe, count=200)
                if df.empty:
                    logger.warning("Empty candle response — skipping iteration")
                    time.sleep(poll_interval_seconds)
                    continue

                account = active_broker.get_account()
                if peak_equity == 0:
                    peak_equity = account.equity
                elif account.equity > peak_equity:
                    peak_equity = account.equity

                allowed, reason = circuit.check(
                    account=account,
                    daily_pnl=daily_pnl,
                    peak_equity=peak_equity,
                )

                if not allowed:
                    logger.warning(f"Circuit breaker: {reason}")
                    if db and system.strategy_id:
                        db.log_risk_event(
                            severity="CRITICAL",
                            event_type="CIRCUIT_BREAKER_TRIGGERED",
                            message=reason,
                            strategy_id=system.strategy_id,
                            action_taken="HALTED_ALL",
                        )
                    time.sleep(poll_interval_seconds)
                    continue

                signal = signal_provider.get_latest_signal(df, config)
                logger.info(
                    f"[{symbol}] Signal: {signal.signal_type.value} | "
                    f"{config.indicator.indicator_type.value.upper()}={signal.indicator_value:.4f} | "
                    f"price={signal.price:.5f}"
                )

                if signal.signal_type in (SignalType.BUY, SignalType.SELL):
                    side = signal.signal_type.value
                    price = signal.price

                    sl = (
                        price * (1 - config.stop_loss_pct)
                        if side == "BUY"
                        else price * (1 + config.stop_loss_pct)
                    )
                    tp = (
                        price * (1 + config.take_profit_pct)
                        if side == "BUY"
                        else price * (1 - config.take_profit_pct)
                    )

                    order = OrderRequest(
                        symbol=symbol,
                        side=side,
                        order_type="MARKET",
                        quantity=config.lot_size,
                        stop_loss=sl,
                        take_profit=tp,
                        client_id=f"{config.name[:20]}-{iteration}",
                    )

                    result = active_broker.submit_order(order)
                    logger.info(
                        f"Order submitted: {result.status} | id={result.broker_order_id} | "
                        f"fill={result.filled_avg_price}"
                    )

                    if result.status == "rejected" and db and system.strategy_id:
                        db.log_risk_event(
                            severity="WARNING",
                            event_type="ORDER_REJECTED",
                            message=result.rejection_reason or "Broker rejected order",
                            strategy_id=system.strategy_id,
                            action_taken="NONE",
                            metadata=dataclasses.asdict(order),
                        )

            except Exception as exc:
                logger.error(f"Live loop error on iteration {iteration}: {exc}")
                if db and system.strategy_id:
                    db.log_risk_event(
                        severity="WARNING",
                        event_type="LIVE_LOOP_ERROR",
                        message=str(exc),
                        strategy_id=system.strategy_id,
                    )

            time.sleep(poll_interval_seconds)

    except KeyboardInterrupt:
        logger.info("Live loop stopped by user (KeyboardInterrupt)")
        system.is_live = False
