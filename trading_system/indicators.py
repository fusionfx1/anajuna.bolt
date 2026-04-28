"""
IndicatorLibrary: Computes technical indicators on OHLCV DataFrames.

Expected DataFrame columns (case-insensitive): open, high, low, close, volume
Returns a new DataFrame with the original columns plus indicator columns appended.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from .models import IndicatorConfig, IndicatorType


def _normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df.columns = [c.lower() for c in df.columns]
    required = {"open", "high", "low", "close"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"DataFrame missing columns: {missing}")
    if "volume" not in df.columns:
        df["volume"] = 0.0
    return df


def _rsi(close: pd.Series, period: int = 14) -> pd.Series:
    delta = close.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)

    avg_gain = gain.ewm(com=period - 1, min_periods=period).mean()
    avg_loss = loss.ewm(com=period - 1, min_periods=period).mean()

    rs = avg_gain / avg_loss.replace(0, np.nan)
    return 100 - (100 / (1 + rs))


def _ema(close: pd.Series, period: int) -> pd.Series:
    return close.ewm(span=period, adjust=False).mean()


def _sma(close: pd.Series, period: int) -> pd.Series:
    return close.rolling(window=period).mean()


def _macd(
    close: pd.Series,
    fast: int = 12,
    slow: int = 26,
    signal: int = 9,
) -> tuple[pd.Series, pd.Series, pd.Series]:
    fast_ema = _ema(close, fast)
    slow_ema = _ema(close, slow)
    macd_line = fast_ema - slow_ema
    signal_line = _ema(macd_line, signal)
    histogram = macd_line - signal_line
    return macd_line, signal_line, histogram


def _bollinger_bands(
    close: pd.Series,
    period: int = 20,
    std: float = 2.0,
) -> tuple[pd.Series, pd.Series, pd.Series]:
    middle = _sma(close, period)
    rolling_std = close.rolling(window=period).std()
    upper = middle + std * rolling_std
    lower = middle - std * rolling_std
    return upper, middle, lower


def _atr(high: pd.Series, low: pd.Series, close: pd.Series, period: int = 14) -> pd.Series:
    tr = pd.concat(
        [
            high - low,
            (high - close.shift()).abs(),
            (low - close.shift()).abs(),
        ],
        axis=1,
    ).max(axis=1)
    return tr.ewm(com=period - 1, min_periods=period).mean()


def _stochastic(
    high: pd.Series,
    low: pd.Series,
    close: pd.Series,
    k_period: int = 14,
    d_period: int = 3,
) -> tuple[pd.Series, pd.Series]:
    lowest_low = low.rolling(window=k_period).min()
    highest_high = high.rolling(window=k_period).max()
    k = 100 * (close - lowest_low) / (highest_high - lowest_low).replace(0, np.nan)
    d = k.rolling(window=d_period).mean()
    return k, d


def _cci(high: pd.Series, low: pd.Series, close: pd.Series, period: int = 20) -> pd.Series:
    typical_price = (high + low + close) / 3
    mean_tp = typical_price.rolling(window=period).mean()
    mean_deviation = typical_price.rolling(window=period).apply(
        lambda x: np.mean(np.abs(x - x.mean())), raw=True
    )
    return (typical_price - mean_tp) / (0.015 * mean_deviation.replace(0, np.nan))


def compute_indicators(df: pd.DataFrame, config: IndicatorConfig) -> pd.DataFrame:
    """
    Compute technical indicators and append columns to the DataFrame.

    Parameters
    ----------
    df : pd.DataFrame
        OHLCV DataFrame with at minimum open, high, low, close columns.
    config : IndicatorConfig
        Indicator type and parameters to compute.

    Returns
    -------
    pd.DataFrame
        Original DataFrame with indicator columns appended.

    Raises
    ------
    ValueError
        If required columns are missing or indicator type is unsupported.
    """
    df = _normalize_columns(df)
    p = config.params
    itype = config.indicator_type

    if itype == IndicatorType.RSI:
        df["rsi"] = _rsi(df["close"], period=p.get("period", 14))

    elif itype == IndicatorType.MACD:
        macd_line, signal_line, histogram = _macd(
            df["close"],
            fast=p.get("fast", 12),
            slow=p.get("slow", 26),
            signal=p.get("signal", 9),
        )
        df["macd"] = macd_line
        df["macd_signal"] = signal_line
        df["macd_hist"] = histogram

    elif itype == IndicatorType.EMA_CROSS:
        df["ema_fast"] = _ema(df["close"], period=p.get("fast", 9))
        df["ema_slow"] = _ema(df["close"], period=p.get("slow", 21))

    elif itype == IndicatorType.SMA_CROSS:
        df["sma_fast"] = _sma(df["close"], period=p.get("fast", 50))
        df["sma_slow"] = _sma(df["close"], period=p.get("slow", 200))

    elif itype == IndicatorType.BOLLINGER:
        upper, middle, lower = _bollinger_bands(
            df["close"],
            period=p.get("period", 20),
            std=p.get("std", 2.0),
        )
        df["bb_upper"] = upper
        df["bb_middle"] = middle
        df["bb_lower"] = lower

    elif itype == IndicatorType.ATR:
        df["atr"] = _atr(
            df["high"], df["low"], df["close"], period=p.get("period", 14)
        )

    elif itype == IndicatorType.STOCHASTIC:
        k, d = _stochastic(
            df["high"],
            df["low"],
            df["close"],
            k_period=p.get("k_period", 14),
            d_period=p.get("d_period", 3),
        )
        df["stoch_k"] = k
        df["stoch_d"] = d

    elif itype == IndicatorType.CCI:
        df["cci"] = _cci(
            df["high"], df["low"], df["close"], period=p.get("period", 20)
        )

    else:
        raise ValueError(f"Unsupported indicator type: {itype}")

    return df
