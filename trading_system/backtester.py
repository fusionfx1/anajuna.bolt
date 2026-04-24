"""
Backtester: Event-driven backtest engine.

Replays historical OHLCV data through the signal engine, simulates
order fills with configurable slippage, and tracks equity after each trade.
Calculates Sharpe, Sortino, Calmar, Profit Factor, and Max Drawdown
to match the metrics shown in the React dashboard.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

import numpy as np
import pandas as pd

from .indicators import compute_indicators
from .models import (
    BacktestResult,
    OrderSide,
    Signal,
    SignalType,
    StrategyConfig,
    Trade,
)
from .signal_engine import _compute_signal_series


@dataclass
class _OpenPosition:
    side: OrderSide
    entry_price: float
    stop_loss: float
    take_profit: float
    lot_size: float
    entry_time: datetime
    entry_signal: Signal


def _calculate_lot_size(config: StrategyConfig, equity: float, entry: float, sl: float) -> float:
    from .models import PositionSizingMethod

    method = config.position_sizing

    if method == PositionSizingMethod.FIXED_LOT:
        return config.lot_size

    if method == PositionSizingMethod.FIXED_FRACTION:
        price_risk = abs(entry - sl)
        if price_risk == 0:
            return config.lot_size
        dollar_risk = equity * config.risk_per_trade_pct
        return round(dollar_risk / price_risk, 4)

    if method == PositionSizingMethod.KELLY:
        return config.lot_size

    return config.lot_size


def _pnl_usd(side: OrderSide, entry: float, exit_: float, lot_size: float) -> float:
    if side == OrderSide.BUY:
        return (exit_ - entry) * lot_size * 100_000
    return (entry - exit_) * lot_size * 100_000


def _pnl_pips(side: OrderSide, entry: float, exit_: float) -> float:
    pip = 0.0001
    if side == OrderSide.BUY:
        return (exit_ - entry) / pip
    return (entry - exit_) / pip


def _sharpe(returns: np.ndarray, periods_per_year: int = 252) -> float:
    if len(returns) < 2:
        return 0.0
    mean = returns.mean()
    std = returns.std(ddof=1)
    if std == 0:
        return 0.0
    return float(mean / std * math.sqrt(periods_per_year))


def _sortino(returns: np.ndarray, periods_per_year: int = 252) -> float:
    if len(returns) < 2:
        return 0.0
    mean = returns.mean()
    downside = returns[returns < 0]
    if len(downside) == 0:
        return float("inf")
    downside_std = downside.std(ddof=1)
    if downside_std == 0:
        return 0.0
    return float(mean / downside_std * math.sqrt(periods_per_year))


def _calmar(total_return: float, max_drawdown: float) -> float:
    if max_drawdown == 0:
        return 0.0
    return total_return / max_drawdown


def _profit_factor(trades: list[Trade]) -> float:
    gross_profit = sum(t.pnl_usd for t in trades if t.pnl_usd > 0)
    gross_loss = abs(sum(t.pnl_usd for t in trades if t.pnl_usd < 0))
    if gross_loss == 0:
        return float("inf") if gross_profit > 0 else 0.0
    return gross_profit / gross_loss


def _max_drawdown(equity_curve: list[float]) -> float:
    if not equity_curve:
        return 0.0
    peak = equity_curve[0]
    max_dd = 0.0
    for eq in equity_curve:
        if eq > peak:
            peak = eq
        dd = (peak - eq) / peak if peak > 0 else 0.0
        if dd > max_dd:
            max_dd = dd
    return max_dd


def run_backtest(
    df: pd.DataFrame,
    config: StrategyConfig,
    initial_balance: float = 10_000.0,
    slippage_pips: float = 1.0,
    commission_per_lot: float = 7.0,
) -> BacktestResult:
    """
    Run an event-driven backtest on historical OHLCV data.

    Parameters
    ----------
    df : pd.DataFrame
        OHLCV DataFrame with DatetimeIndex. Minimum ~100 rows recommended.
    config : StrategyConfig
        Parsed strategy configuration.
    initial_balance : float
        Starting account balance in USD.
    slippage_pips : float
        Simulated slippage applied to every fill.
    commission_per_lot : float
        Round-trip commission in USD per standard lot.

    Returns
    -------
    BacktestResult
        Comprehensive backtest result including trades, equity curve, and metrics.
    """
    if not isinstance(df.index, pd.DatetimeIndex):
        df = df.copy()
        df.index = pd.to_datetime(df.index)

    df = compute_indicators(df, config.indicator)
    signal_series = _compute_signal_series(df, config)

    pip_value = 0.0001
    slippage = slippage_pips * pip_value

    equity = initial_balance
    open_positions: list[_OpenPosition] = []
    completed_trades: list[Trade] = []
    equity_curve: list[float] = [equity]
    equity_timestamps: list[datetime] = [df.index[0].to_pydatetime()]

    for i, (ts, signal_type) in enumerate(signal_series.items()):
        row = df.loc[ts]
        current_price = float(row["close"])
        high = float(row["high"])
        low = float(row["low"])
        ts_dt = pd.Timestamp(ts).to_pydatetime()

        still_open: list[_OpenPosition] = []
        for pos in open_positions:
            exit_price: Optional[float] = None
            exit_reason = ""

            if pos.side == OrderSide.BUY:
                if low <= pos.stop_loss:
                    exit_price = pos.stop_loss
                    exit_reason = "stop_loss"
                elif high >= pos.take_profit:
                    exit_price = pos.take_profit
                    exit_reason = "take_profit"
            else:
                if high >= pos.stop_loss:
                    exit_price = pos.stop_loss
                    exit_reason = "stop_loss"
                elif low <= pos.take_profit:
                    exit_price = pos.take_profit
                    exit_reason = "take_profit"

            if exit_price is not None:
                pnl = _pnl_usd(pos.side, pos.entry_price, exit_price, pos.lot_size)
                pnl -= commission_per_lot * pos.lot_size
                equity += pnl
                completed_trades.append(
                    Trade(
                        symbol=config.symbols[0],
                        side=pos.side,
                        entry_price=pos.entry_price,
                        exit_price=exit_price,
                        lot_size=pos.lot_size,
                        stop_loss=pos.stop_loss,
                        take_profit=pos.take_profit,
                        entry_time=pos.entry_time,
                        exit_time=ts_dt,
                        pnl_usd=round(pnl, 2),
                        pnl_pips=round(_pnl_pips(pos.side, pos.entry_price, exit_price), 1),
                        exit_reason=exit_reason,
                    )
                )
            else:
                still_open.append(pos)

        open_positions = still_open
        equity_curve.append(equity)
        equity_timestamps.append(ts_dt)

        if len(open_positions) >= config.max_concurrent_trades:
            continue

        if signal_type == SignalType.BUY:
            fill_price = current_price + slippage
            sl = fill_price * (1 - config.stop_loss_pct)
            tp = fill_price * (1 + config.take_profit_pct)
            lot = _calculate_lot_size(config, equity, fill_price, sl)
            open_positions.append(
                _OpenPosition(
                    side=OrderSide.BUY,
                    entry_price=fill_price,
                    stop_loss=sl,
                    take_profit=tp,
                    lot_size=lot,
                    entry_time=ts_dt,
                    entry_signal=Signal(
                        timestamp=ts_dt,
                        signal_type=signal_type,
                        indicator_value=0.0,
                        price=fill_price,
                    ),
                )
            )

        elif signal_type == SignalType.SELL:
            fill_price = current_price - slippage
            sl = fill_price * (1 + config.stop_loss_pct)
            tp = fill_price * (1 - config.take_profit_pct)
            lot = _calculate_lot_size(config, equity, fill_price, sl)
            open_positions.append(
                _OpenPosition(
                    side=OrderSide.SELL,
                    entry_price=fill_price,
                    stop_loss=sl,
                    take_profit=tp,
                    lot_size=lot,
                    entry_time=ts_dt,
                    entry_signal=Signal(
                        timestamp=ts_dt,
                        signal_type=signal_type,
                        indicator_value=0.0,
                        price=fill_price,
                    ),
                )
            )

    for pos in open_positions:
        last_price = float(df["close"].iloc[-1])
        pnl = _pnl_usd(pos.side, pos.entry_price, last_price, pos.lot_size)
        pnl -= commission_per_lot * pos.lot_size
        equity += pnl
        completed_trades.append(
            Trade(
                symbol=config.symbols[0],
                side=pos.side,
                entry_price=pos.entry_price,
                exit_price=last_price,
                lot_size=pos.lot_size,
                stop_loss=pos.stop_loss,
                take_profit=pos.take_profit,
                entry_time=pos.entry_time,
                exit_time=df.index[-1].to_pydatetime(),
                pnl_usd=round(pnl, 2),
                pnl_pips=round(_pnl_pips(pos.side, pos.entry_price, last_price), 1),
                exit_reason="end_of_data",
            )
        )

    winners = [t for t in completed_trades if t.is_winner]
    losers = [t for t in completed_trades if not t.is_winner]

    total_pnl = equity - initial_balance
    win_rate = len(winners) / len(completed_trades) if completed_trades else 0.0

    equity_arr = np.array(equity_curve)
    returns = np.diff(equity_arr) / equity_arr[:-1]

    max_dd = _max_drawdown(equity_curve)
    sharpe = _sharpe(returns)
    sortino = _sortino(returns)
    total_return = total_pnl / initial_balance
    calmar = _calmar(total_return, max_dd)
    pf = _profit_factor(completed_trades)

    avg_win = float(np.mean([t.pnl_usd for t in winners])) if winners else 0.0
    avg_loss = float(np.mean([t.pnl_usd for t in losers])) if losers else 0.0
    largest_win = max((t.pnl_usd for t in winners), default=0.0)
    largest_loss = min((t.pnl_usd for t in losers), default=0.0)

    equity_curve_records = [
        {
            "timestamp": ts.isoformat(),
            "equity": round(eq, 2),
            "drawdown_pct": round(
                (max(equity_curve[: i + 1]) - eq) / max(equity_curve[: i + 1]) * 100
                if max(equity_curve[: i + 1]) > 0
                else 0.0,
                2,
            ),
        }
        for i, (ts, eq) in enumerate(zip(equity_timestamps, equity_curve))
    ]

    return BacktestResult(
        config=config,
        trades=completed_trades,
        equity_curve=equity_curve_records,
        initial_balance=initial_balance,
        final_balance=round(equity, 2),
        total_trades=len(completed_trades),
        winning_trades=len(winners),
        losing_trades=len(losers),
        win_rate=round(win_rate, 4),
        total_pnl_usd=round(total_pnl, 2),
        max_drawdown_pct=round(max_dd, 4),
        sharpe_ratio=round(sharpe, 4),
        sortino_ratio=round(sortino, 4),
        calmar_ratio=round(calmar, 4),
        profit_factor=round(pf, 4),
        avg_win_usd=round(avg_win, 2),
        avg_loss_usd=round(avg_loss, 2),
        largest_win=round(largest_win, 2),
        largest_loss=round(largest_loss, 2),
    )
