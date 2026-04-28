"""
Unit tests for the PromptParser module.
Run with: pytest trading_system/tests/test_prompt_parser.py -v
"""
import pytest

from ..models import IndicatorType, StrategyType
from ..prompt_parser import ParseError, parse_prompt


class TestRSIPrompt:
    PROMPT_TH = (
        "สร้างระบบเทรด RSI โดยซื้อเมื่อ RSI ต่ำกว่า 30 และขายเมื่อ RSI สูงกว่า 70 "
        "พร้อม stop loss 2% และ take profit 5%"
    )
    PROMPT_EN = (
        "RSI strategy: buy when RSI below 30, sell when RSI above 70. "
        "Stop loss 2%, take profit 5%. EURUSD H1."
    )

    def test_thai_indicator_detected(self):
        cfg = parse_prompt(self.PROMPT_TH)
        assert cfg.indicator.indicator_type == IndicatorType.RSI

    def test_thai_buy_threshold(self):
        cfg = parse_prompt(self.PROMPT_TH)
        assert cfg.signal_condition.buy_threshold == 30.0

    def test_thai_sell_threshold(self):
        cfg = parse_prompt(self.PROMPT_TH)
        assert cfg.signal_condition.sell_threshold == 70.0

    def test_thai_stop_loss(self):
        cfg = parse_prompt(self.PROMPT_TH)
        assert cfg.stop_loss_pct == pytest.approx(0.02, abs=1e-6)

    def test_thai_take_profit(self):
        cfg = parse_prompt(self.PROMPT_TH)
        assert cfg.take_profit_pct == pytest.approx(0.05, abs=1e-6)

    def test_english_prompt(self):
        cfg = parse_prompt(self.PROMPT_EN)
        assert cfg.indicator.indicator_type == IndicatorType.RSI
        assert cfg.signal_condition.buy_threshold == 30.0
        assert cfg.signal_condition.sell_threshold == 70.0

    def test_strategy_type_mean_reversion(self):
        cfg = parse_prompt(self.PROMPT_TH)
        assert cfg.strategy_type == StrategyType.MEAN_REVERSION

    def test_default_symbol(self):
        cfg = parse_prompt(self.PROMPT_TH)
        assert "EURUSD" in cfg.symbols

    def test_rsi_period_default(self):
        cfg = parse_prompt(self.PROMPT_TH)
        assert cfg.indicator.params["period"] == 14

    def test_supabase_dict_keys(self):
        cfg = parse_prompt(self.PROMPT_TH)
        d = cfg.to_supabase_dict()
        for key in ("name", "description", "strategy_type", "config", "lot_size"):
            assert key in d


class TestMACDPrompt:
    PROMPT = (
        "Create a MACD crossover strategy on GBPUSD. "
        "Buy when MACD histogram crosses above zero, sell when it crosses below. "
        "Stop loss 1.5%, take profit 3%. Timeframe H4."
    )

    def test_indicator(self):
        cfg = parse_prompt(self.PROMPT)
        assert cfg.indicator.indicator_type == IndicatorType.MACD

    def test_timeframe(self):
        cfg = parse_prompt(self.PROMPT)
        assert cfg.timeframe == "H4"

    def test_symbol(self):
        cfg = parse_prompt(self.PROMPT)
        assert "GBPUSD" in cfg.symbols

    def test_stop_loss(self):
        cfg = parse_prompt(self.PROMPT)
        assert cfg.stop_loss_pct == pytest.approx(0.015, abs=1e-6)


class TestEMACrossPrompt:
    PROMPT = (
        "EMA crossover: buy when 9-period EMA crosses above 21-period EMA, "
        "sell when it crosses below. EURUSD H1 timeframe. Stop loss 2%, take profit 4%."
    )

    def test_indicator(self):
        cfg = parse_prompt(self.PROMPT)
        assert cfg.indicator.indicator_type == IndicatorType.EMA_CROSS

    def test_strategy_type(self):
        cfg = parse_prompt(self.PROMPT)
        assert cfg.strategy_type == StrategyType.TREND


class TestBollingerPrompt:
    PROMPT = (
        "Bollinger Bands mean reversion on USDJPY. "
        "Buy below lower band, sell above upper band. SL 1%, TP 2%."
    )

    def test_indicator(self):
        cfg = parse_prompt(self.PROMPT)
        assert cfg.indicator.indicator_type == IndicatorType.BOLLINGER

    def test_symbol(self):
        cfg = parse_prompt(self.PROMPT)
        assert "USDJPY" in cfg.symbols


class TestParseError:
    def test_raises_on_no_indicator(self):
        with pytest.raises(ParseError):
            parse_prompt("buy when the market goes up and sell when it goes down")
