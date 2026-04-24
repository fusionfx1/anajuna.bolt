"""
Data models for the trading system generator.
Mirrors the Supabase schema used by the React dashboard.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Optional


class IndicatorType(str, Enum):
    RSI = "rsi"
    MACD = "macd"
    EMA_CROSS = "ema_cross"
    BOLLINGER = "bollinger"
    ATR = "atr"
    SMA_CROSS = "sma_cross"
    STOCHASTIC = "stochastic"
    CCI = "cci"


class SignalType(str, Enum):
    BUY = "BUY"
    SELL = "SELL"
    HOLD = "HOLD"


class StrategyType(str, Enum):
    SCALPING = "scalping"
    SWING = "swing"
    TREND = "trend"
    MEAN_REVERSION = "mean_reversion"


class PositionSizingMethod(str, Enum):
    FIXED_LOT = "fixed_lot"
    FIXED_FRACTION = "fixed_fraction"
    KELLY = "kelly"


class OrderType(str, Enum):
    MARKET = "MARKET"
    LIMIT = "LIMIT"


class OrderSide(str, Enum):
    BUY = "BUY"
    SELL = "SELL"


@dataclass
class IndicatorConfig:
    indicator_type: IndicatorType
    params: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not self.params:
            self.params = self._default_params()

    def _default_params(self) -> dict[str, Any]:
        defaults: dict[IndicatorType, dict[str, Any]] = {
            IndicatorType.RSI: {"period": 14},
            IndicatorType.MACD: {"fast": 12, "slow": 26, "signal": 9},
            IndicatorType.EMA_CROSS: {"fast": 9, "slow": 21},
            IndicatorType.SMA_CROSS: {"fast": 50, "slow": 200},
            IndicatorType.BOLLINGER: {"period": 20, "std": 2.0},
            IndicatorType.ATR: {"period": 14},
            IndicatorType.STOCHASTIC: {"k_period": 14, "d_period": 3},
            IndicatorType.CCI: {"period": 20},
        }
        return defaults.get(self.indicator_type, {})


@dataclass
class SignalCondition:
    buy_threshold: float
    sell_threshold: float
    buy_condition: str = "below"
    sell_condition: str = "above"


@dataclass
class StrategyConfig:
    name: str
    description: str
    indicator: IndicatorConfig
    signal_condition: SignalCondition
    stop_loss_pct: float = 0.02
    take_profit_pct: float = 0.04
    strategy_type: StrategyType = StrategyType.MEAN_REVERSION
    symbols: list[str] = field(default_factory=lambda: ["EURUSD"])
    timeframe: str = "H1"
    lot_size: float = 0.01
    max_concurrent_trades: int = 3
    position_sizing: PositionSizingMethod = PositionSizingMethod.FIXED_FRACTION
    risk_per_trade_pct: float = 0.01
    max_drawdown_pct: float = 0.08
    raw_prompt: str = ""

    def to_supabase_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "strategy_type": self.strategy_type.value,
            "status": "backtesting",
            "symbols": self.symbols,
            "config": {
                "indicator": self.indicator.indicator_type.value,
                "indicator_params": self.indicator.params,
                "buy_threshold": self.signal_condition.buy_threshold,
                "sell_threshold": self.signal_condition.sell_threshold,
                "stop_loss_pct": self.stop_loss_pct,
                "take_profit_pct": self.take_profit_pct,
                "timeframe": self.timeframe,
                "position_sizing": self.position_sizing.value,
                "risk_per_trade_pct": self.risk_per_trade_pct,
                "raw_prompt": self.raw_prompt,
            },
            "lot_size": self.lot_size,
            "max_concurrent_trades": self.max_concurrent_trades,
            "max_drawdown_pct": self.max_drawdown_pct * 100,
        }


@dataclass
class Signal:
    timestamp: datetime
    signal_type: SignalType
    indicator_value: float
    price: float
    reason: str = ""


@dataclass
class Trade:
    symbol: str
    side: OrderSide
    entry_price: float
    exit_price: float
    lot_size: float
    stop_loss: float
    take_profit: float
    entry_time: datetime
    exit_time: datetime
    pnl_usd: float
    pnl_pips: float
    exit_reason: str = ""

    @property
    def is_winner(self) -> bool:
        return self.pnl_usd > 0


@dataclass
class BacktestResult:
    config: StrategyConfig
    trades: list[Trade]
    equity_curve: list[dict[str, Any]]
    initial_balance: float
    final_balance: float
    total_trades: int
    winning_trades: int
    losing_trades: int
    win_rate: float
    total_pnl_usd: float
    max_drawdown_pct: float
    sharpe_ratio: float
    sortino_ratio: float
    calmar_ratio: float
    profit_factor: float
    avg_win_usd: float
    avg_loss_usd: float
    largest_win: float
    largest_loss: float
    strategy_id: Optional[str] = None

    def summary(self) -> str:
        lines = [
            f"=== Backtest Results: {self.config.name} ===",
            f"Period      : {len(self.equity_curve)} candles",
            f"Trades      : {self.total_trades} (W:{self.winning_trades} / L:{self.losing_trades})",
            f"Win Rate    : {self.win_rate:.1%}",
            f"Total PnL   : ${self.total_pnl_usd:,.2f}",
            f"Max Drawdown: {self.max_drawdown_pct:.2%}",
            f"Sharpe      : {self.sharpe_ratio:.3f}",
            f"Sortino     : {self.sortino_ratio:.3f}",
            f"Calmar      : {self.calmar_ratio:.3f}",
            f"Profit Factor: {self.profit_factor:.2f}",
            f"Avg Win     : ${self.avg_win_usd:.2f}  |  Avg Loss: ${self.avg_loss_usd:.2f}",
        ]
        return "\n".join(lines)


@dataclass
class TradingSystem:
    config: StrategyConfig
    backtest_result: Optional[BacktestResult]
    strategy_id: Optional[str] = None
    is_live: bool = False
