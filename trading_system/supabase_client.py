"""
SupabaseClient: Persistence layer for the Python trading system.

Mirrors the table schema defined in the project Supabase migrations
so generated strategies and backtest results appear in the React dashboard.

Tables used:
  - strategies
  - positions
  - trades
  - equity_snapshots
  - risk_events
"""
from __future__ import annotations

import os
import time
from typing import Any, Optional
from uuid import uuid4

from loguru import logger


def _get_client():
    try:
        from supabase import create_client, Client
    except ImportError as e:
        raise ImportError(
            "supabase package not installed. Run: pip install supabase"
        ) from e

    url = os.environ.get("VITE_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
    key = os.environ.get("VITE_SUPABASE_ANON_KEY") or os.environ.get("SUPABASE_ANON_KEY")

    if not url or not key:
        raise EnvironmentError(
            "Supabase credentials not found. Set VITE_SUPABASE_URL and "
            "VITE_SUPABASE_ANON_KEY in your .env file."
        )

    return create_client(url, key)


def _retry(fn, retries: int = 3, delay: float = 1.0):
    last_exc: Optional[Exception] = None
    for attempt in range(retries):
        try:
            return fn()
        except Exception as exc:
            last_exc = exc
            logger.warning(f"Supabase call failed (attempt {attempt + 1}/{retries}): {exc}")
            time.sleep(delay * (attempt + 1))
    raise last_exc  # type: ignore[misc]


class SupabaseClient:
    """
    Wrapper around supabase-py that handles retries and maps Python models
    to the existing dashboard database schema.

    Must be used as an authenticated user. Pass user_id from the currently
    logged-in session, or use the service role key for server-side automation.
    """

    def __init__(self, user_id: str) -> None:
        self._client = _get_client()
        self.user_id = user_id

    def save_strategy(self, strategy_dict: dict[str, Any]) -> str:
        """
        Insert a new strategy row and return the generated UUID.

        Parameters
        ----------
        strategy_dict : dict
            Dict produced by StrategyConfig.to_supabase_dict().

        Returns
        -------
        str
            The UUID of the created strategy row.
        """
        payload = {**strategy_dict, "user_id": self.user_id}

        def _insert():
            res = self._client.table("strategies").insert(payload).execute()
            return res.data[0]["id"]

        strategy_id: str = _retry(_insert)
        logger.info(f"Saved strategy {strategy_dict.get('name')} -> id={strategy_id}")
        return strategy_id

    def update_strategy_stats(
        self,
        strategy_id: str,
        total_trades: int,
        win_rate: float,
        total_pnl_usd: float,
        sharpe_ratio: float,
        status: str = "backtesting",
    ) -> None:
        def _update():
            self._client.table("strategies").update(
                {
                    "total_trades": total_trades,
                    "win_rate": round(win_rate * 100, 2),
                    "total_pnl_usd": total_pnl_usd,
                    "sharpe_ratio": sharpe_ratio,
                    "status": status,
                }
            ).eq("id", strategy_id).execute()

        _retry(_update)
        logger.info(f"Updated strategy stats for {strategy_id}")

    def save_backtest_trades(
        self,
        strategy_id: str,
        trades: list[dict[str, Any]],
    ) -> list[str]:
        """
        Persist backtest trades as positions + trade records.

        Parameters
        ----------
        strategy_id : str
            UUID of the parent strategy row.
        trades : list[dict]
            Each dict is a serialised Trade object from BacktestResult.trades.

        Returns
        -------
        list[str]
            List of created position IDs.
        """
        position_ids: list[str] = []

        for t in trades:
            position_payload = {
                "user_id": self.user_id,
                "strategy_id": strategy_id,
                "symbol": t["symbol"],
                "direction": t["side"],
                "lot_size": t["lot_size"],
                "entry_price": t["entry_price"],
                "exit_price": t["exit_price"],
                "stop_loss": t["stop_loss"],
                "take_profit": t["take_profit"],
                "pnl_usd": t["pnl_usd"],
                "pnl_pips": t["pnl_pips"],
                "status": "closed",
                "opened_at": t["entry_time"],
                "closed_at": t["exit_time"],
            }

            def _insert_position(p=position_payload):
                res = self._client.table("positions").insert(p).execute()
                return res.data[0]["id"]

            position_id: str = _retry(_insert_position)
            position_ids.append(position_id)

            trade_payload = {
                "user_id": self.user_id,
                "position_id": position_id,
                "strategy_id": strategy_id,
                "symbol": t["symbol"],
                "order_type": "MARKET",
                "side": t["side"],
                "quantity": t["lot_size"],
                "requested_price": t["entry_price"],
                "fill_price": t["entry_price"],
                "slippage_pips": 1.0,
                "commission_usd": round(t["lot_size"] * 7.0, 2),
                "swap_usd": 0.0,
                "pnl_usd": t["pnl_usd"],
                "execution_latency_ms": 0,
                "executed_at": t["entry_time"],
            }

            def _insert_trade(tr=trade_payload):
                self._client.table("trades").insert(tr).execute()

            _retry(_insert_trade)

        logger.info(f"Saved {len(trades)} backtest trades for strategy {strategy_id}")
        return position_ids

    def save_equity_snapshots(
        self,
        equity_curve: list[dict[str, Any]],
        chunk_size: int = 50,
    ) -> None:
        """
        Persist equity curve as equity_snapshot rows.
        Inserts in chunks to avoid request size limits.

        Parameters
        ----------
        equity_curve : list[dict]
            List of {timestamp, equity, drawdown_pct} dicts from BacktestResult.
        chunk_size : int
            Number of rows per insert batch.
        """
        rows = [
            {
                "user_id": self.user_id,
                "balance": point["equity"],
                "equity": point["equity"],
                "margin_used": 0.0,
                "free_margin": point["equity"],
                "drawdown_pct": point.get("drawdown_pct", 0.0),
                "open_positions_count": 0,
                "snapshot_at": point["timestamp"],
            }
            for point in equity_curve
        ]

        for i in range(0, len(rows), chunk_size):
            chunk = rows[i : i + chunk_size]

            def _insert(c=chunk):
                self._client.table("equity_snapshots").insert(c).execute()

            _retry(_insert)

        logger.info(f"Saved {len(rows)} equity snapshots")

    def log_risk_event(
        self,
        severity: str,
        event_type: str,
        message: str,
        strategy_id: Optional[str] = None,
        action_taken: str = "NONE",
        metadata: Optional[dict] = None,
    ) -> None:
        """
        Write a risk event to the risk_events table (visible in the Risk Monitor tab).

        Parameters
        ----------
        severity : str
            INFO | WARNING | CRITICAL
        event_type : str
            Short identifier, e.g. "CIRCUIT_BREAKER_TRIGGERED"
        message : str
            Human-readable description.
        strategy_id : str, optional
            UUID of the related strategy.
        action_taken : str
            NONE | PAUSED_BOT | CLOSED_POSITIONS | HALTED_ALL
        metadata : dict, optional
            Additional context stored as JSONB.
        """
        payload: dict[str, Any] = {
            "user_id": self.user_id,
            "severity": severity,
            "event_type": event_type,
            "message": message,
            "action_taken": action_taken,
            "metadata": metadata or {},
        }
        if strategy_id:
            payload["strategy_id"] = strategy_id

        def _insert():
            self._client.table("risk_events").insert(payload).execute()

        _retry(_insert)
        logger.info(f"Logged risk event: [{severity}] {event_type}")

    def get_user_settings(self) -> Optional[dict[str, Any]]:
        def _fetch():
            res = (
                self._client.table("user_settings")
                .select("*")
                .eq("user_id", self.user_id)
                .maybeSingle()
                .execute()
            )
            return res.data

        return _retry(_fetch)

    def get_account_snapshot(self) -> Optional[dict[str, Any]]:
        def _fetch():
            res = (
                self._client.table("account_snapshots")
                .select("*")
                .eq("user_id", self.user_id)
                .order("updated_at", desc=True)
                .limit(1)
                .execute()
            )
            return res.data[0] if res.data else None

        return _retry(_fetch)

    def save_account_snapshot(self, snapshot: dict[str, Any]) -> None:
        payload = {**snapshot, "user_id": self.user_id}

        def _upsert():
            self._client.table("account_snapshots").upsert(
                payload, on_conflict="user_id"
            ).execute()

        _retry(_upsert)
        logger.info("Saved account snapshot")
