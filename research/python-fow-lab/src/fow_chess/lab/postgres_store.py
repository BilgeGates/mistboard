"""Postgres adapter for the lab self-play corpus.

Writes whole-game records to the `lab_games` table (one row per game) so a
multi-worker rollout can run on the Railway engine-worker without an
attached filesystem. Schema is in apps/server/migrations/019_lab_self_play.sql.

Usage:
    from fow_chess.lab.postgres_store import LabCorpusStore

    with LabCorpusStore(corpus_id="c-prod-railway-v0") as store:
        next_idx = store.next_corpus_idx()      # resume point
        store.insert_game(corpus_idx=next_idx, game_id=..., data={...})

The store is intentionally minimal: one table, no per-position rows.
Per-position training features are derived from `data["events"]` at
load-time so the on-disk schema can evolve without DB migrations.
"""

from __future__ import annotations

import json
import os
from types import TracebackType
from typing import Any, Iterator

import psycopg


class LabCorpusStore:
    """Thin wrapper around a single Postgres connection scoped to one corpus."""

    def __init__(self, corpus_id: str, dsn: str | None = None) -> None:
        if not corpus_id:
            raise ValueError("corpus_id is required")
        self.corpus_id = corpus_id
        self._dsn = dsn or os.environ.get("DATABASE_URL")
        if not self._dsn:
            raise RuntimeError(
                "DATABASE_URL not set; pass dsn= or export DATABASE_URL"
            )
        self._conn: psycopg.Connection | None = None

    # --- lifecycle -----------------------------------------------------

    def connect(self) -> None:
        if self._conn is not None:
            return
        self._conn = psycopg.connect(self._dsn, autocommit=True)

    def close(self) -> None:
        if self._conn is not None:
            self._conn.close()
            self._conn = None

    def __enter__(self) -> "LabCorpusStore":
        self.connect()
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        self.close()

    # --- queries -------------------------------------------------------

    def _require_conn(self) -> psycopg.Connection:
        if self._conn is None:
            raise RuntimeError("LabCorpusStore not connected; use `with` or .connect()")
        return self._conn

    def next_corpus_idx(self) -> int:
        """Return the next corpus_idx to write. 0 if the corpus is empty."""
        conn = self._require_conn()
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COALESCE(MAX(corpus_idx) + 1, 0) FROM lab_games WHERE corpus_id = %s",
                (self.corpus_id,),
            )
            row = cur.fetchone()
        return int(row[0]) if row else 0

    def count(self) -> int:
        conn = self._require_conn()
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) FROM lab_games WHERE corpus_id = %s",
                (self.corpus_id,),
            )
            row = cur.fetchone()
        return int(row[0]) if row else 0

    def insert_game(self, *, corpus_idx: int, game_id: str, data: dict[str, Any]) -> None:
        """Insert one game row. ON CONFLICT(game_id) DO NOTHING — idempotent
        on retries, but a different game with the same id is treated as a
        no-op (caller is responsible for unique game_ids)."""
        conn = self._require_conn()
        payload = json.dumps(data, separators=(",", ":"))
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO lab_games (game_id, corpus_id, corpus_idx, data)
                VALUES (%s, %s, %s, %s::jsonb)
                ON CONFLICT (game_id) DO NOTHING
                """,
                (game_id, self.corpus_id, corpus_idx, payload),
            )

    def iter_games(self) -> Iterator[dict[str, Any]]:
        """Yield game payloads in corpus_idx order. For offline corpus reads."""
        conn = self._require_conn()
        # Use a client cursor (no name) so autocommit connections work. The
        # whole corpus comfortably fits in memory at lab scale; if it grows
        # past that, switch the connection out of autocommit and re-add the
        # server cursor name for streaming.
        with conn.cursor() as cur:
            cur.execute(
                "SELECT data FROM lab_games WHERE corpus_id = %s ORDER BY corpus_idx",
                (self.corpus_id,),
            )
            for (data,) in cur:
                yield data
