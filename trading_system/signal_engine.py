"""
SignalEngine: Evaluates indicator values and emits BUY / SELL / HOLD signals.

Each call to generate_signals() returns a list of Signal objects aligned
with the DataFrame rows where a signal is triggered.
"""
from __future__ import annotations

import pandas as pd

from .indicators import compute_indicators
from .models import (
    IndicatorType,
    Signal,
    SignalCondition,
    SignalType,
    StrategyConfig,
)


def _get_primary_value_col(indicator_type: IndicatorType) -> str:
    col_map = {
        IndicatorType.RSI: "rsi",
        IndicatorType.MACD: "macd",
        IndicatorType.EMA_CROSS: "ema_fast",
        IndicatorType.SMA_CROSS: "sma_fast",
        IndicatorType.BOLLINGER: "close",
        IndicatorType.ATR: "atr",
        IndicatorType.STOCHASTIC: "stoch_k",
        IndicatorType.CCI: "cci",
    }
    return col_map[indicator_type]


def _rsi_signals(df: pd.DataFrame, cond: SignalCondition) -> pd.Series:
    signals = pd.Series(SignalType.HOLD, index=df.index)
    signals[df["rsi"] < cond.buy_threshold] = SignalType.BUY
    signals[df["rsi"] > cond.sell_threshold] = SignalType.SELL
    return signals


def _macd_signals(df: pd.DataFrame, cond: SignalCondition) -> pd.Series:
    signals = pd.Series(SignalType.HOLD, index=df.index)
    prev_hist = df["macd_hist"].shift(1)
    signals[(prev_hist < 0) & (df["macd_hist"] >= 0)] = SignalType.BUY
    signals[(prev_hist > 0) & (df["macd_hist"] <= 0)] = SignalType.SELL
    return signals


def _cross_signals(fast_col: str, slow_col: str, df: pd.DataFrame) -> pd.Series:
    signals = pd.Series(SignalType.HOLD, index=df.index)
    fast = df[fast_col]
    slow = df[slow_col]
    prev_fast = fast.shift(1)
    prev_slow = slow.shift(1)
    signals[(prev_fast <= prev_slow) & (fast > slow)] = SignalType.BUY
    signals[(prev_fast >= prev_slow) & (fast < slow)] = SignalType.SELL
    return signals


def _bollinger_signals(df: pd.DataFrame, cond: SignalCondition) -> pd.Series:
    signals = pd.Series(SignalType.HOLD, index=df.index)
    prev_close = df["close"].shift(1)
    signals[
        (prev_close >= df["bb_lower"]) & (df["close"] < df["bb_lower"])
    ] = SignalType.BUY
    signals[
        (prev_close <= df["bb_upper"]) & (df["close"] > df["bb_upper"])
    ] = SignalType.SELL
    return signals


def _stochastic_signals(df: pd.DataFrame, cond: SignalCondition) -> pd.Series:
    signals = pd.Series(SignalType.HOLD, index=df.index)
    signals[
        (df["stoch_k"] < cond.buy_threshold) & (df["stoch_d"] < cond.buy_threshold)
    ] = SignalType.BUY
    signals[
        (df["stoch_k"] > cond.sell_threshold) & (df["stoch_d"] > cond.sell_threshold)
    ] = SignalType.SELL
    return signals


def _cci_signals(df: pd.DataFrame, cond: SignalCondition) -> pd.Series:
    signals = pd.Series(SignalType.HOLD, index=df.index)
    signals[df["cci"] < cond.buy_threshold] = SignalType.BUY
    signals[df["cci"] > cond.sell_threshold] = SignalType.SELL
    return signals


def _compute_signal_series(df: pd.DataFrame, config: StrategyConfig) -> pd.Series:
    itype = config.indicator.indicator_type
    cond = config.signal_condition

    if itype == IndicatorType.RSI:
        return _rsi_signals(df, cond)
    if itype == IndicatorType.MACD:
        return _macd_signals(df, cond)
    if itype == IndicatorType.EMA_CROSS:
        return _cross_signals("ema_fast", "ema_slow", df)
    if itype == IndicatorType.SMA_CROSS:
        return _cross_signals("sma_fast", "sma_slow", df)
    if itype == IndicatorType.BOLLINGER:
        return _bollinger_signals(df, cond)
    if itype == IndicatorType.STOCHASTIC:
        return _stochastic_signals(df, cond)
    if itype == IndicatorType.CCI:
        return _cci_signals(df, cond)

    return pd.Series(SignalType.HOLD, index=df.index)


def generate_signals(df: pd.DataFrame, config: StrategyConfig) -> list[Signal]:
    """
    Compute indicators and generate trading signals for a given DataFrame.

    Parameters
    ----------
    df : pd.DataFrame
        OHLCV DataFrame. Index must be datetime (or convertible).
    config : StrategyConfig
        Fully parsed strategy configuration.

    Returns
    -------
    list[Signal]
        All non-HOLD signals with timestamp, price, and indicator value.
    """
    if not isinstance(df.index, pd.DatetimeIndex):
        df = df.copy()
        df.index = pd.to_datetime(df.index)

    df = compute_indicators(df, config.indicator)
    signal_series = _compute_signal_series(df, config)

    primary_col = _get_primary_value_col(config.indicator.indicator_type)
    if primary_col not in df.columns:
        primary_col = "close"

    signals: list[Signal] = []
    for ts, sig in signal_series.items():
        if sig == SignalType.HOLD:
            continue
        signals.append(
            Signal(
                timestamp=pd.Timestamp(ts).to_pydatetime(),
                signal_type=sig,
                indicator_value=float(df.loc[ts, primary_col]),
                price=float(df.loc[ts, "close"]),
                reason=f"{config.indicator.indicator_type.value.upper()} = "
                       f"{df.loc[ts, primary_col]:.4f}",
            )
        )

    return signals


def get_latest_signal(df: pd.DataFrame, config: StrategyConfig) -> Signal:
    """
    Compute indicator on df and return the signal for the LAST candle only.
    Used in live trading polling loops.
    """
    if not isinstance(df.index, pd.DatetimeIndex):
        df = df.copy()
        df.index = pd.to_datetime(df.index)

    df = compute_indicators(df, config.indicator)
    signal_series = _compute_signal_series(df, config)

    last_ts = df.index[-1]
    sig = signal_series.iloc[-1]

    primary_col = _get_primary_value_col(config.indicator.indicator_type)
    if primary_col not in df.columns:
        primary_col = "close"

    return Signal(
        timestamp=pd.Timestamp(last_ts).to_pydatetime(),
        signal_type=sig,
        indicator_value=float(df.loc[last_ts, primary_col]),
        price=float(df.loc[last_ts, "close"]),
        reason=f"{config.indicator.indicator_type.value.upper()} = "
               f"{df.loc[last_ts, primary_col]:.4f}",
    )
