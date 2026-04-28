"""
Broker Integration Layer

Provides an abstract BrokerConnector interface with two concrete implementations:
  1. OandaConnector  - connects to OANDA v20 REST API (practice or live)
  2. PaperConnector  - simulates order execution locally, no network calls

Both connectors return a unified OrderResult so the live trading loop
does not need to know which broker is in use.
"""
from __future__ import annotations

import random
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

import pandas as pd
import requests
from loguru import logger


# ---------------------------------------------------------------------------
# Shared data structures
# ---------------------------------------------------------------------------

@dataclass
class OrderRequest:
    symbol: str
    side: str
    order_type: str = "MARKET"
    quantity: float = 0.01
    limit_price: Optional[float] = None
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None
    client_id: str = ""


@dataclass
class OrderResult:
    broker_order_id: str
    status: str
    filled_qty: float
    filled_avg_price: Optional[float]
    submitted_at: str
    rejection_reason: str = ""


@dataclass
class AccountInfo:
    balance: float
    equity: float
    margin_used: float
    free_margin: float
    open_trade_count: int
    currency: str = "USD"


@dataclass
class Candle:
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float = 0.0


# ---------------------------------------------------------------------------
# Abstract base
# ---------------------------------------------------------------------------

class BrokerConnector(ABC):

    @abstractmethod
    def get_account(self) -> AccountInfo: ...

    @abstractmethod
    def submit_order(self, order: OrderRequest) -> OrderResult: ...

    @abstractmethod
    def cancel_order(self, broker_order_id: str) -> None: ...

    @abstractmethod
    def get_candles(
        self,
        symbol: str,
        timeframe: str,
        count: int = 500,
    ) -> pd.DataFrame: ...

    @abstractmethod
    def get_latest_price(self, symbol: str) -> float: ...


# ---------------------------------------------------------------------------
# OANDA Connector
# ---------------------------------------------------------------------------

_OANDA_PRACTICE_URL = "https://api-fxpractice.oanda.com"
_OANDA_LIVE_URL = "https://api-fxtrade.oanda.com"

_OANDA_TF_MAP = {
    "M1": "M1", "M5": "M5", "M15": "M15", "M30": "M30",
    "H1": "H1", "H4": "H4", "D1": "D", "W1": "W",
}

_MAX_RETRIES = 3
_RETRY_DELAY = 2.0


def _oanda_headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Accept-Datetime-Format": "RFC3339",
    }


def _oanda_symbol(symbol: str) -> str:
    return symbol.replace("/", "_")


class OandaConnector(BrokerConnector):
    """
    Connects to the OANDA v20 REST API.

    Parameters
    ----------
    account_id : str
        OANDA account ID.
    api_token : str
        OANDA personal access token.
    account_type : str
        "practice" (default) or "live".
    """

    def __init__(
        self,
        account_id: str,
        api_token: str,
        account_type: str = "practice",
    ) -> None:
        self.account_id = account_id
        self.api_token = api_token
        self.base_url = _OANDA_LIVE_URL if account_type == "live" else _OANDA_PRACTICE_URL
        logger.info(f"OandaConnector initialised ({account_type})")

    def _get(self, path: str, params: Optional[dict] = None) -> dict:
        url = f"{self.base_url}{path}"
        for attempt in range(_MAX_RETRIES):
            try:
                r = requests.get(
                    url,
                    headers=_oanda_headers(self.api_token),
                    params=params,
                    timeout=10,
                )
                if r.status_code == 429:
                    time.sleep(_RETRY_DELAY * (attempt + 1))
                    continue
                r.raise_for_status()
                return r.json()
            except requests.RequestException as exc:
                if attempt == _MAX_RETRIES - 1:
                    raise
                logger.warning(f"OANDA GET retry {attempt + 1}: {exc}")
                time.sleep(_RETRY_DELAY)
        return {}

    def _post(self, path: str, body: dict) -> dict:
        url = f"{self.base_url}{path}"
        for attempt in range(_MAX_RETRIES):
            try:
                r = requests.post(
                    url,
                    headers=_oanda_headers(self.api_token),
                    json=body,
                    timeout=10,
                )
                if r.status_code == 429:
                    time.sleep(_RETRY_DELAY * (attempt + 1))
                    continue
                r.raise_for_status()
                return r.json()
            except requests.RequestException as exc:
                if attempt == _MAX_RETRIES - 1:
                    raise
                logger.warning(f"OANDA POST retry {attempt + 1}: {exc}")
                time.sleep(_RETRY_DELAY)
        return {}

    def get_account(self) -> AccountInfo:
        data = self._get(f"/v3/accounts/{self.account_id}/summary")
        acct = data.get("account", {})
        return AccountInfo(
            balance=float(acct.get("balance", 0)),
            equity=float(acct.get("NAV", 0)),
            margin_used=float(acct.get("marginUsed", 0)),
            free_margin=float(acct.get("marginAvailable", 0)),
            open_trade_count=int(acct.get("openTradeCount", 0)),
            currency=acct.get("currency", "USD"),
        )

    def submit_order(self, order: OrderRequest) -> OrderResult:
        instrument = _oanda_symbol(order.symbol)
        units = str(order.quantity) if order.side == "BUY" else str(-order.quantity)

        body: dict[str, Any] = {
            "order": {
                "type": order.order_type,
                "instrument": instrument,
                "units": units,
                "timeInForce": "FOK" if order.order_type == "MARKET" else "GTC",
            }
        }

        if order.stop_loss:
            body["order"]["stopLossOnFill"] = {"price": f"{order.stop_loss:.5f}"}
        if order.take_profit:
            body["order"]["takeProfitOnFill"] = {"price": f"{order.take_profit:.5f}"}
        if order.client_id:
            body["order"]["clientExtensions"] = {"id": order.client_id}

        data = self._post(f"/v3/accounts/{self.account_id}/orders", body)

        filled = data.get("orderFillTransaction")
        created = data.get("orderCreateTransaction", {})

        if filled:
            return OrderResult(
                broker_order_id=filled.get("id", ""),
                status="filled",
                filled_qty=abs(float(filled.get("units", order.quantity))),
                filled_avg_price=float(filled["price"]) if "price" in filled else None,
                submitted_at=filled.get("time", datetime.now(timezone.utc).isoformat()),
            )

        return OrderResult(
            broker_order_id=created.get("id", ""),
            status="submitted",
            filled_qty=0.0,
            filled_avg_price=None,
            submitted_at=created.get("time", datetime.now(timezone.utc).isoformat()),
        )

    def cancel_order(self, broker_order_id: str) -> None:
        url = f"{self.base_url}/v3/accounts/{self.account_id}/orders/{broker_order_id}/cancel"
        r = requests.put(url, headers=_oanda_headers(self.api_token), timeout=10)
        if r.status_code not in (200, 404):
            raise RuntimeError(f"OANDA cancel failed: HTTP {r.status_code}")

    def get_candles(self, symbol: str, timeframe: str, count: int = 500) -> pd.DataFrame:
        instrument = _oanda_symbol(symbol)
        gran = _OANDA_TF_MAP.get(timeframe, "H1")
        data = self._get(
            f"/v3/instruments/{instrument}/candles",
            params={"granularity": gran, "count": count, "price": "M"},
        )
        candles = data.get("candles", [])
        rows = []
        for c in candles:
            if not c.get("complete", True):
                continue
            mid = c.get("mid", {})
            rows.append(
                {
                    "timestamp": c["time"],
                    "open": float(mid.get("o", 0)),
                    "high": float(mid.get("h", 0)),
                    "low": float(mid.get("l", 0)),
                    "close": float(mid.get("c", 0)),
                    "volume": float(c.get("volume", 0)),
                }
            )
        df = pd.DataFrame(rows)
        if df.empty:
            return df
        df["timestamp"] = pd.to_datetime(df["timestamp"])
        df = df.set_index("timestamp").sort_index()
        return df

    def get_latest_price(self, symbol: str) -> float:
        instrument = _oanda_symbol(symbol)
        data = self._get(
            f"/v3/accounts/{self.account_id}/pricing",
            params={"instruments": instrument},
        )
        prices = data.get("prices", [{}])
        bid = float(prices[0].get("bids", [{"price": "0"}])[0]["price"])
        ask = float(prices[0].get("asks", [{"price": "0"}])[0]["price"])
        return (bid + ask) / 2


# ---------------------------------------------------------------------------
# Paper Trading Connector
# ---------------------------------------------------------------------------

class PaperConnector(BrokerConnector):
    """
    Simulates order execution locally with configurable slippage.
    No network calls. Useful for testing strategies before going live.

    Parameters
    ----------
    initial_balance : float
        Starting paper account balance in USD.
    slippage_pips : float
        Simulated fill slippage applied to every order.
    rejection_rate : float
        Probability (0-1) of a random order rejection (simulates broker errors).
    """

    def __init__(
        self,
        initial_balance: float = 100_000.0,
        slippage_pips: float = 1.0,
        rejection_rate: float = 0.02,
    ) -> None:
        self._balance = initial_balance
        self._equity = initial_balance
        self._slippage = slippage_pips * 0.0001
        self._rejection_rate = rejection_rate
        self._open_trades: int = 0
        self._price_cache: dict[str, float] = {}
        self._order_counter = 0
        logger.info(f"PaperConnector initialised (balance={initial_balance})")

    def get_account(self) -> AccountInfo:
        return AccountInfo(
            balance=self._balance,
            equity=self._equity,
            margin_used=self._open_trades * 250.0,
            free_margin=self._equity - self._open_trades * 250.0,
            open_trade_count=self._open_trades,
        )

    def submit_order(self, order: OrderRequest) -> OrderResult:
        self._order_counter += 1
        broker_id = f"PAPER-{self._order_counter:06d}"
        now = datetime.now(timezone.utc).isoformat()

        if random.random() < self._rejection_rate:
            return OrderResult(
                broker_order_id=broker_id,
                status="rejected",
                filled_qty=0.0,
                filled_avg_price=None,
                submitted_at=now,
                rejection_reason="Simulated random rejection",
            )

        price = self._price_cache.get(order.symbol, 1.1000)
        fill_price = (
            price + self._slippage if order.side == "BUY" else price - self._slippage
        )

        self._open_trades += 1
        logger.debug(
            f"PaperConnector: {order.side} {order.quantity} {order.symbol} @ {fill_price:.5f}"
        )

        return OrderResult(
            broker_order_id=broker_id,
            status="filled",
            filled_qty=order.quantity,
            filled_avg_price=fill_price,
            submitted_at=now,
        )

    def cancel_order(self, broker_order_id: str) -> None:
        if self._open_trades > 0:
            self._open_trades -= 1

    def get_candles(self, symbol: str, timeframe: str, count: int = 500) -> pd.DataFrame:
        """
        Generate synthetic OHLCV data using a random walk.
        In production, replace this with a real data provider (e.g. Alpaca, Polygon).
        """
        logger.warning(
            f"PaperConnector: generating synthetic candles for {symbol}. "
            "Connect a real data feed for live trading."
        )
        rng = pd.date_range(end=pd.Timestamp.utcnow(), periods=count, freq="1h")
        prices = [1.1000]
        for _ in range(count - 1):
            prices.append(prices[-1] * (1 + random.gauss(0, 0.0005)))

        df = pd.DataFrame(index=rng)
        df["open"] = prices
        df["close"] = [p * (1 + random.gauss(0, 0.0002)) for p in prices]
        df["high"] = df[["open", "close"]].max(axis=1) * (1 + abs(random.gauss(0, 0.0001)))
        df["low"] = df[["open", "close"]].min(axis=1) * (1 - abs(random.gauss(0, 0.0001)))
        df["volume"] = [random.randint(100, 1000) for _ in range(count)]
        df.index.name = "timestamp"

        self._price_cache[symbol] = float(df["close"].iloc[-1])
        return df

    def get_latest_price(self, symbol: str) -> float:
        return self._price_cache.get(symbol, 1.1000)

    def update_equity(self, pnl: float) -> None:
        self._equity += pnl
        if self._open_trades > 0:
            self._open_trades -= 1


# ---------------------------------------------------------------------------
# Circuit Breaker
# ---------------------------------------------------------------------------

class CircuitBreaker:
    """
    Enforces risk limits before every order submission.
    Mirrors the circuit breaker settings in user_settings (Supabase).

    Parameters
    ----------
    max_daily_loss_pct : float
        Maximum allowed daily loss as a fraction of balance (e.g. 0.03 = 3%).
    max_drawdown_pct : float
        Maximum allowed drawdown from peak equity as a fraction (e.g. 0.08 = 8%).
    max_spread_pips : float
        Reject orders if the spread exceeds this many pips.
    halt_overnight : bool
        If True, block orders outside of configured trading hours.
    """

    def __init__(
        self,
        max_daily_loss_pct: float = 0.03,
        max_drawdown_pct: float = 0.08,
        max_spread_pips: float = 3.0,
        halt_overnight: bool = False,
    ) -> None:
        self.max_daily_loss_pct = max_daily_loss_pct
        self.max_drawdown_pct = max_drawdown_pct
        self.max_spread_pips = max_spread_pips
        self.halt_overnight = halt_overnight
        self._halted = False

    def check(
        self,
        account: AccountInfo,
        daily_pnl: float,
        peak_equity: float,
        current_spread_pips: float = 0.0,
    ) -> tuple[bool, str]:
        """
        Returns (allowed: bool, reason: str).
        allowed=False means the order must NOT be submitted.
        """
        if self._halted:
            return False, "Circuit breaker manually halted"

        daily_loss_pct = daily_pnl / account.balance if account.balance else 0
        if daily_loss_pct < -self.max_daily_loss_pct:
            self._halted = True
            return False, (
                f"Daily loss limit breached: {daily_loss_pct:.2%} "
                f"(limit: -{self.max_daily_loss_pct:.2%})"
            )

        if peak_equity > 0:
            drawdown = (peak_equity - account.equity) / peak_equity
            if drawdown > self.max_drawdown_pct:
                self._halted = True
                return False, (
                    f"Max drawdown breached: {drawdown:.2%} "
                    f"(limit: {self.max_drawdown_pct:.2%})"
                )

        if current_spread_pips > self.max_spread_pips:
            return False, (
                f"Spread too wide: {current_spread_pips:.1f} pips "
                f"(max: {self.max_spread_pips:.1f})"
            )

        return True, "OK"

    def reset(self) -> None:
        self._halted = False
