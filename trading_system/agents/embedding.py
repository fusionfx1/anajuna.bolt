"""
Embedding utilities: OpenAI text → vector, and top-k retrieval via Supabase RPC.

Guarded by USE_PGVECTOR env var (default "1"). Set USE_PGVECTOR=0 to disable
all embedding operations and make retrieve_similar() return [] immediately.
"""
from __future__ import annotations

import os
from typing import Optional

from loguru import logger

_USE_PGVECTOR: bool = os.environ.get("USE_PGVECTOR", "1").strip().lower() not in (
    "0", "false", "no"
)
_EMBED_MODEL = "text-embedding-3-small"  # 1536-dim, cheap, fast
_EMBED_DIM = 1536


def _openai_client():
    """Lazy import so the module loads without openai installed."""
    try:
        from openai import OpenAI
        api_key = os.environ.get("OPENAI_API_KEY", "").strip()
        if not api_key:
            raise EnvironmentError("OPENAI_API_KEY not set")
        return OpenAI(api_key=api_key)
    except ImportError as exc:
        raise ImportError("openai package not installed") from exc


def _supabase_client():
    """Lazy import; uses service-role key when available."""
    try:
        from supabase import create_client
    except ImportError as exc:
        raise ImportError("supabase package not installed") from exc

    url = os.environ.get("VITE_SUPABASE_URL") or os.environ.get("SUPABASE_URL", "")
    key = (
        os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        or os.environ.get("VITE_SUPABASE_ANON_KEY")
        or os.environ.get("SUPABASE_ANON_KEY", "")
    )
    if not url or not key:
        raise EnvironmentError("Supabase credentials not configured")
    return create_client(url, key)


def embed_text(text: str) -> Optional[list[float]]:
    """
    Embed text using OpenAI text-embedding-3-small (1536 dims).

    Returns None if USE_PGVECTOR=0, OPENAI_API_KEY missing, or any error.
    """
    if not _USE_PGVECTOR:
        return None
    if not text or not text.strip():
        return None

    try:
        client = _openai_client()
        response = client.embeddings.create(
            model=_EMBED_MODEL,
            input=text[:8191],  # model token limit guard
        )
        return response.data[0].embedding
    except Exception as exc:
        logger.debug(f"[embedding] embed_text failed: {exc}")
        return None


def retrieve_similar(
    query_embedding: list[float],
    *,
    symbol: Optional[str] = None,
    user_id: Optional[str] = None,
    top_k: int = 5,
) -> list[dict]:
    """
    Retrieve top-k most similar past agent decisions via Supabase RPC.

    Calls the `match_agent_decisions` function defined in the migration.
    Returns [] when USE_PGVECTOR=0, embeddings unavailable, or on any error.

    Parameters
    ----------
    query_embedding: 1536-dim vector for the current context.
    symbol:         Filter by trading symbol (e.g. "EURUSD").
    user_id:        Filter by Supabase user UUID.
    top_k:          Number of results to return (default 5).
    """
    if not _USE_PGVECTOR:
        return []
    if not query_embedding:
        return []

    try:
        client = _supabase_client()
        params: dict = {
            "query_embedding": query_embedding,
            "match_count": top_k,
        }
        if user_id:
            params["filter_user_id"] = user_id
        if symbol:
            params["filter_symbol"] = symbol

        result = client.rpc("match_agent_decisions", params).execute()
        return result.data or []

    except Exception as exc:
        logger.debug(f"[embedding] retrieve_similar failed: {exc}")
        return []


def embed_and_store(decision_id: str, text: str) -> bool:
    """
    Convenience: embed text and update agent_decisions.embedding in one call.

    Intended to be called from a background thread after save_decision().
    Returns True on success, False otherwise.
    """
    if not _USE_PGVECTOR:
        return False

    embedding = embed_text(text)
    if not embedding:
        return False

    try:
        from .persistence import save_decision_embedding
        return save_decision_embedding(decision_id, embedding)
    except Exception as exc:
        logger.debug(f"[embedding] embed_and_store failed: {exc}")
        return False
