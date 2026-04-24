"""
PromptParser: Converts natural language trading strategy descriptions
into structured StrategyConfig objects using rule-based keyword extraction.

Supports Thai and English prompts.
"""
from __future__ import annotations

import re
from typing import Optional

from .models import (
    IndicatorConfig,
    IndicatorType,
    PositionSizingMethod,
    SignalCondition,
    StrategyConfig,
    StrategyType,
)


class ParseError(Exception):
    pass


_INDICATOR_PATTERNS: list[tuple[IndicatorType, list[str]]] = [
    (IndicatorType.RSI,        ["rsi", "relative strength"]),
    (IndicatorType.MACD,       ["macd", "moving average convergence"]),
    (IndicatorType.EMA_CROSS,  ["ema cross", "exponential moving average cross", "ema crossover"]),
    (IndicatorType.SMA_CROSS,  ["sma cross", "simple moving average cross", "sma crossover", "golden cross", "death cross"]),
    (IndicatorType.BOLLINGER,  ["bollinger", "bb band", "bollinger band"]),
    (IndicatorType.STOCHASTIC, ["stochastic", "stoch"]),
    (IndicatorType.CCI,        ["cci", "commodity channel"]),
    (IndicatorType.ATR,        ["atr", "average true range"]),
]

_STRATEGY_TYPE_PATTERNS: dict[StrategyType, list[str]] = {
    StrategyType.SCALPING:       ["scalp", "สกัลปิ้ง", "สกัลป์"],
    StrategyType.SWING:          ["swing", "สวิง"],
    StrategyType.TREND:          ["trend follow", "ตามเทรน", "ตามแนวโน้ม"],
    StrategyType.MEAN_REVERSION: ["mean reversion", "reversal", "oversold", "overbought",
                                  "ซื้อแล้วกลับ", "rsi", "bollinger"],
}

_SYMBOL_PATTERNS: list[tuple[str, list[str]]] = [
    ("EURUSD", ["eurusd", "eur/usd", "eur usd"]),
    ("GBPUSD", ["gbpusd", "gbp/usd", "gbp usd"]),
    ("USDJPY", ["usdjpy", "usd/jpy", "usd jpy"]),
    ("AUDUSD", ["audusd", "aud/usd", "aud usd"]),
    ("USDCAD", ["usdcad", "usd/cad", "usd cad"]),
    ("NZDUSD", ["nzdusd", "nzd/usd", "nzd usd"]),
    ("USDCHF", ["usdchf", "usd/chf", "usd chf"]),
    ("EURGBP", ["eurgbp", "eur/gbp", "eur gbp"]),
    ("XAUUSD", ["xauusd", "gold", "ทอง"]),
    ("BTCUSD", ["btcusd", "bitcoin", "btc"]),
]

_TIMEFRAME_PATTERNS: list[tuple[str, list[str]]] = [
    ("M1",  ["m1", "1 minute", "1min", "1 นาที"]),
    ("M5",  ["m5", "5 minute", "5min", "5 นาที"]),
    ("M15", ["m15", "15 minute", "15min", "15 นาที"]),
    ("M30", ["m30", "30 minute", "30min", "30 นาที"]),
    ("H1",  ["h1", "1 hour", "1h", "1 ชั่วโมง", "hourly"]),
    ("H4",  ["h4", "4 hour", "4h", "4 ชั่วโมง"]),
    ("D1",  ["d1", "daily", "1 day", "รายวัน"]),
    ("W1",  ["w1", "weekly", "รายสัปดาห์"]),
]


def _search(text: str, keywords: list[str]) -> bool:
    for kw in keywords:
        escaped = re.escape(kw)
        if re.search(rf"\b{escaped}\b", text, re.IGNORECASE):
            return True
    return False


def _extract_float_after(text: str, patterns: list[str]) -> Optional[float]:
    for pattern in patterns:
        m = re.search(
            rf"{re.escape(pattern)}\s*[:\s=]?\s*([\d]+(?:\.[\d]+)?)\s*%?",
            text,
            re.IGNORECASE,
        )
        if m:
            return float(m.group(1))
    return None


def _extract_int_after(text: str, patterns: list[str]) -> Optional[int]:
    for pattern in patterns:
        m = re.search(
            rf"{re.escape(pattern)}\s*[:\s=]?\s*([\d]+)",
            text,
            re.IGNORECASE,
        )
        if m:
            return int(m.group(1))
    return None


def _detect_indicator(text: str) -> IndicatorType:
    for indicator_type, keywords in _INDICATOR_PATTERNS:
        if _search(text, keywords):
            return indicator_type
    raise ParseError(
        "ไม่พบ indicator ในคำอธิบาย กรุณาระบุ เช่น RSI, MACD, EMA Cross, Bollinger Bands"
    )


def _detect_strategy_type(text: str, indicator: IndicatorType) -> StrategyType:
    for stype, keywords in _STRATEGY_TYPE_PATTERNS.items():
        if _search(text, keywords):
            return stype
    if indicator in (IndicatorType.RSI, IndicatorType.BOLLINGER, IndicatorType.CCI, IndicatorType.STOCHASTIC):
        return StrategyType.MEAN_REVERSION
    if indicator in (IndicatorType.EMA_CROSS, IndicatorType.SMA_CROSS, IndicatorType.MACD):
        return StrategyType.TREND
    return StrategyType.SWING


def _detect_symbols(text: str) -> list[str]:
    found: list[str] = []
    for symbol, keywords in _SYMBOL_PATTERNS:
        if _search(text, keywords):
            found.append(symbol)
    return found if found else ["EURUSD"]


def _detect_timeframe(text: str) -> str:
    for tf, keywords in _TIMEFRAME_PATTERNS:
        if _search(text, keywords):
            return tf
    return "H1"


def _extract_indicator_params(text: str, indicator: IndicatorType) -> dict:
    params: dict = {}

    if indicator == IndicatorType.RSI:
        period = _extract_int_after(text, ["rsi period", "rsi(", "period", "คาบ"])
        params["period"] = period if period else 14

    elif indicator == IndicatorType.MACD:
        fast = _extract_int_after(text, ["fast", "ค่าเร็ว"])
        slow = _extract_int_after(text, ["slow", "ค่าช้า"])
        signal = _extract_int_after(text, ["signal", "สัญญาณ"])
        params["fast"] = fast if fast else 12
        params["slow"] = slow if slow else 26
        params["signal"] = signal if signal else 9

    elif indicator == IndicatorType.EMA_CROSS:
        fast = _extract_int_after(text, ["ema fast", "fast ema", "fast"])
        slow = _extract_int_after(text, ["ema slow", "slow ema", "slow"])
        params["fast"] = fast if fast else 9
        params["slow"] = slow if slow else 21

    elif indicator == IndicatorType.SMA_CROSS:
        fast = _extract_int_after(text, ["sma fast", "fast sma", "fast"])
        slow = _extract_int_after(text, ["sma slow", "slow sma", "slow"])
        params["fast"] = fast if fast else 50
        params["slow"] = slow if slow else 200

    elif indicator == IndicatorType.BOLLINGER:
        period = _extract_int_after(text, ["period", "bb period", "คาบ"])
        std = _extract_float_after(text, ["std", "standard deviation", "deviation"])
        params["period"] = period if period else 20
        params["std"] = std if std else 2.0

    elif indicator == IndicatorType.STOCHASTIC:
        k = _extract_int_after(text, ["%k", "k period", "k"])
        d = _extract_int_after(text, ["%d", "d period", "d"])
        params["k_period"] = k if k else 14
        params["d_period"] = d if d else 3

    elif indicator == IndicatorType.CCI:
        period = _extract_int_after(text, ["period", "คาบ"])
        params["period"] = period if period else 20

    elif indicator == IndicatorType.ATR:
        period = _extract_int_after(text, ["period", "atr period", "คาบ"])
        params["period"] = period if period else 14

    return params


def _extract_signal_conditions(text: str, indicator: IndicatorType) -> SignalCondition:
    buy_threshold: Optional[float] = None
    sell_threshold: Optional[float] = None

    buy_threshold = _extract_float_after(
        text,
        ["ซื้อเมื่อ", "buy when", "buy below", "ซื้อต่ำกว่า", "oversold at", "below"]
    )
    sell_threshold = _extract_float_after(
        text,
        ["ขายเมื่อ", "sell when", "sell above", "ขายสูงกว่า", "overbought at", "above"]
    )

    if buy_threshold is None:
        buy_threshold = _extract_float_after(text, ["ต่ำกว่า", "น้อยกว่า", "lower than"])
    if sell_threshold is None:
        sell_threshold = _extract_float_after(text, ["สูงกว่า", "มากกว่า", "higher than", "greater than"])

    if buy_threshold is None and sell_threshold is None:
        if indicator == IndicatorType.RSI:
            buy_threshold, sell_threshold = 30.0, 70.0
        elif indicator == IndicatorType.STOCHASTIC:
            buy_threshold, sell_threshold = 20.0, 80.0
        elif indicator == IndicatorType.CCI:
            buy_threshold, sell_threshold = -100.0, 100.0
        elif indicator == IndicatorType.BOLLINGER:
            buy_threshold, sell_threshold = -2.0, 2.0
        else:
            buy_threshold, sell_threshold = 0.0, 0.0

    buy_threshold = buy_threshold or 30.0
    sell_threshold = sell_threshold or 70.0

    buy_condition = "above" if indicator in (IndicatorType.EMA_CROSS, IndicatorType.SMA_CROSS, IndicatorType.MACD) else "below"
    sell_condition = "below" if indicator in (IndicatorType.EMA_CROSS, IndicatorType.SMA_CROSS, IndicatorType.MACD) else "above"

    return SignalCondition(
        buy_threshold=buy_threshold,
        sell_threshold=sell_threshold,
        buy_condition=buy_condition,
        sell_condition=sell_condition,
    )


def _extract_position_sizing(text: str) -> tuple[PositionSizingMethod, float, float]:
    if _search(text, ["kelly", "เคลลี่"]):
        return PositionSizingMethod.KELLY, 0.01, 0.01

    risk_pct = _extract_float_after(text, [
        "risk per trade", "risk", "ความเสี่ยงต่อเทรด", "ความเสี่ยง"
    ])
    if risk_pct and risk_pct > 1.0:
        risk_pct = risk_pct / 100.0

    lot_size = _extract_float_after(text, ["lot size", "lot", "ลอต"])

    if lot_size:
        return PositionSizingMethod.FIXED_LOT, lot_size, risk_pct or 0.01
    return PositionSizingMethod.FIXED_FRACTION, lot_size or 0.01, risk_pct or 0.01


def _generate_name(indicator: IndicatorType, strategy_type: StrategyType, symbols: list[str]) -> str:
    indicator_label = indicator.value.upper().replace("_", " ")
    type_label = strategy_type.value.replace("_", " ").title()
    symbol_label = "/".join(symbols[:2])
    return f"{indicator_label} {type_label} - {symbol_label}"


def parse_prompt(prompt: str) -> StrategyConfig:
    """
    Parse a natural language trading strategy prompt into a StrategyConfig.

    Supports Thai and English. Raises ParseError if no indicator is detected.

    Parameters
    ----------
    prompt : str
        Natural language description of the trading strategy.

    Returns
    -------
    StrategyConfig
        Fully populated strategy configuration object.

    Examples
    --------
    >>> config = parse_prompt(
    ...     "สร้างระบบเทรด RSI โดยซื้อเมื่อ RSI ต่ำกว่า 30 และขายเมื่อ RSI สูงกว่า 70 "
    ...     "พร้อม stop loss 2% และ take profit 5%"
    ... )
    >>> config.indicator.indicator_type
    <IndicatorType.RSI: 'rsi'>
    >>> config.stop_loss_pct
    0.02
    """
    text = prompt.strip()
    text_lower = text.lower()

    indicator_type = _detect_indicator(text_lower)
    indicator_params = _extract_indicator_params(text_lower, indicator_type)
    indicator = IndicatorConfig(indicator_type=indicator_type, params=indicator_params)

    strategy_type = _detect_strategy_type(text_lower, indicator_type)
    symbols = _detect_symbols(text_lower)
    timeframe = _detect_timeframe(text_lower)
    signal_condition = _extract_signal_conditions(text_lower, indicator_type)

    stop_loss_pct = _extract_float_after(
        text_lower, ["stop loss", "stoploss", "sl", "ตัดขาดทุน", "stop"]
    )
    if stop_loss_pct and stop_loss_pct > 1.0:
        stop_loss_pct /= 100.0

    take_profit_pct = _extract_float_after(
        text_lower, ["take profit", "takeprofit", "tp", "เป้าหมายกำไร", "กำไร"]
    )
    if take_profit_pct and take_profit_pct > 1.0:
        take_profit_pct /= 100.0

    max_concurrent = _extract_int_after(
        text_lower, ["max trade", "max concurrent", "maximum trade", "จำนวน trade สูงสุด"]
    )

    position_method, lot_size, risk_pct = _extract_position_sizing(text_lower)

    name = _generate_name(indicator_type, strategy_type, symbols)
    description = f"Auto-generated from prompt: {text[:200]}"

    return StrategyConfig(
        name=name,
        description=description,
        indicator=indicator,
        signal_condition=signal_condition,
        stop_loss_pct=stop_loss_pct if stop_loss_pct else 0.02,
        take_profit_pct=take_profit_pct if take_profit_pct else 0.04,
        strategy_type=strategy_type,
        symbols=symbols,
        timeframe=timeframe,
        lot_size=lot_size,
        max_concurrent_trades=max_concurrent if max_concurrent else 3,
        position_sizing=position_method,
        risk_per_trade_pct=risk_pct,
        raw_prompt=text,
    )
