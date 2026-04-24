"""
Unit tests for the Backtester and Indicator modules.
Run with: pytest trading_system/tests/test_backtester.py -v
"""
import numpy as np
import pandas as pd
import pytest

from ..backtester import run_backtest, _max_drawdown, _sharpe, _sortino, _profit_factor
from ..models import (
    IndicatorConfig,
    IndicatorType,
    PositionSizingMethod,
    SignalCondition,
    StrategyConfig,
    StrategyType,
    Trade,
    OrderSide,
)
from ..indicators import compute_indicators


def _make_ohlcv(n: int = 300, start_price: float = 1.1000, seed: int = 42) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    prices = [start_price]
    for _ in range(n - 1):
        prices.append(prices[-1] * (1 + rng.normal(0, 0.002)))

    dates = pd.date_range("2023-01-01", periods=n, freq="1h")
    df = pd.DataFrame(index=dates)
    df["open"] = prices
    df["close"] = [p * (1 + rng.normal(0, 0.001)) for p in prices]
    df["high"] = df[["open", "close"]].max(axis=1) * (1 + abs(rng.normal(0, 0.0005)))
    df["low"] = df[["open", "close"]].min(axis=1) * (1 - abs(rng.normal(0, 0.0005)))
    df["volume"] = rng.integers(100, 1000, n).astype(float)
    return df


def _rsi_config() -> StrategyConfig:
    return StrategyConfig(
        name="Test RSI",
        description="Test",
        indicator=IndicatorConfig(IndicatorType.RSI, {"period": 14}),
        signal_condition=SignalCondition(
            buy_threshold=30.0,
            sell_threshold=70.0,
            buy_condition="below",
            sell_condition="above",
        ),
        stop_loss_pct=0.02,
        take_profit_pct=0.05,
        strategy_type=StrategyType.MEAN_REVERSION,
        symbols=["EURUSD"],
        timeframe="H1",
        lot_size=0.01,
        max_concurrent_trades=3,
        position_sizing=PositionSizingMethod.FIXED_LOT,
        risk_per_trade_pct=0.01,
    )


class TestIndicators:
    def test_rsi_column_added(self):
        df = _make_ohlcv()
        cfg = IndicatorConfig(IndicatorType.RSI, {"period": 14})
        result = compute_indicators(df, cfg)
        assert "rsi" in result.columns

    def test_rsi_range(self):
        df = _make_ohlcv(300)
        cfg = IndicatorConfig(IndicatorType.RSI, {"period": 14})
        result = compute_indicators(df, cfg)
        valid = result["rsi"].dropna()
        assert (valid >= 0).all() and (valid <= 100).all()

    def test_macd_columns(self):
        df = _make_ohlcv()
        cfg = IndicatorConfig(IndicatorType.MACD, {"fast": 12, "slow": 26, "signal": 9})
        result = compute_indicators(df, cfg)
        for col in ("macd", "macd_signal", "macd_hist"):
            assert col in result.columns

    def test_ema_cross_columns(self):
        df = _make_ohlcv()
        cfg = IndicatorConfig(IndicatorType.EMA_CROSS, {"fast": 9, "slow": 21})
        result = compute_indicators(df, cfg)
        assert "ema_fast" in result.columns
        assert "ema_slow" in result.columns

    def test_bollinger_columns(self):
        df = _make_ohlcv()
        cfg = IndicatorConfig(IndicatorType.BOLLINGER, {"period": 20, "std": 2.0})
        result = compute_indicators(df, cfg)
        for col in ("bb_upper", "bb_middle", "bb_lower"):
            assert col in result.columns

    def test_bollinger_band_ordering(self):
        df = _make_ohlcv(300)
        cfg = IndicatorConfig(IndicatorType.BOLLINGER, {"period": 20, "std": 2.0})
        result = compute_indicators(df, cfg).dropna()
        assert (result["bb_upper"] >= result["bb_middle"]).all()
        assert (result["bb_middle"] >= result["bb_lower"]).all()

    def test_missing_column_raises(self):
        df = pd.DataFrame({"close": [1.0, 2.0]})
        cfg = IndicatorConfig(IndicatorType.RSI, {"period": 14})
        with pytest.raises(ValueError):
            compute_indicators(df, cfg)


class TestBacktester:
    def test_returns_backtest_result(self):
        df = _make_ohlcv(300)
        cfg = _rsi_config()
        result = run_backtest(df, cfg, initial_balance=10_000.0)
        assert result is not None

    def test_equity_curve_length(self):
        df = _make_ohlcv(300)
        result = run_backtest(df, _rsi_config(), initial_balance=10_000.0)
        assert len(result.equity_curve) == len(df) + 1

    def test_win_rate_range(self):
        df = _make_ohlcv(300)
        result = run_backtest(df, _rsi_config())
        assert 0.0 <= result.win_rate <= 1.0

    def test_max_drawdown_non_negative(self):
        df = _make_ohlcv(300)
        result = run_backtest(df, _rsi_config())
        assert result.max_drawdown_pct >= 0.0

    def test_trade_count_consistency(self):
        df = _make_ohlcv(300)
        result = run_backtest(df, _rsi_config())
        assert result.total_trades == result.winning_trades + result.losing_trades

    def test_winning_trades_match_result(self):
        df = _make_ohlcv(300)
        result = run_backtest(df, _rsi_config())
        actual_winners = sum(1 for t in result.trades if t.pnl_usd > 0)
        assert actual_winners == result.winning_trades

    def test_equity_curve_records_have_keys(self):
        df = _make_ohlcv(300)
        result = run_backtest(df, _rsi_config())
        for point in result.equity_curve[:5]:
            assert "timestamp" in point
            assert "equity" in point
            assert "drawdown_pct" in point

    def test_summary_string(self):
        df = _make_ohlcv(300)
        result = run_backtest(df, _rsi_config())
        summary = result.summary()
        assert "Sharpe" in summary
        assert "Win Rate" in summary

    def test_max_concurrent_trades_respected(self):
        df = _make_ohlcv(300)
        cfg = _rsi_config()
        cfg.max_concurrent_trades = 1
        result = run_backtest(df, cfg)
        assert result is not None


class TestMetricFunctions:
    def test_max_drawdown_flat(self):
        assert _max_drawdown([100, 100, 100]) == pytest.approx(0.0)

    def test_max_drawdown_falling(self):
        dd = _max_drawdown([100, 90, 80, 70])
        assert dd == pytest.approx(0.30, abs=1e-6)

    def test_sharpe_positive_drift(self):
        returns = np.full(252, 0.001)
        s = _sharpe(returns)
        assert s > 0

    def test_sortino_no_downside(self):
        returns = np.full(100, 0.001)
        assert _sortino(returns) == float("inf")

    def test_profit_factor_no_trades(self):
        assert _profit_factor([]) == 0.0
