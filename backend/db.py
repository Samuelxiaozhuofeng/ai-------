from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent / "data.sqlite3"


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


@contextmanager
def db_conn():
    conn = _connect()
    try:
        yield conn
    finally:
        conn.close()


def init_db() -> None:
    with db_conn() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS vocabulary (
              id TEXT PRIMARY KEY,
              book_id TEXT NOT NULL,
              word TEXT NOT NULL,
              status TEXT NOT NULL,
              context_json TEXT,
              analysis_json TEXT,
              display_word TEXT,
              source_chapter_id TEXT,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            )
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_vocab_book_id ON vocabulary(book_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_vocab_status ON vocabulary(status)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_vocab_updated_at ON vocabulary(updated_at)")

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS progress (
              book_id TEXT PRIMARY KEY,
              chapter_id TEXT,
              page_number INTEGER NOT NULL,
              scroll_position INTEGER NOT NULL,
              char_offset INTEGER NOT NULL DEFAULT 0,
              chapter_text_hash TEXT,
              updated_at TEXT NOT NULL
            )
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_progress_updated_at ON progress(updated_at)")

        # Lightweight migrations for existing sqlite DBs
        cols = {row["name"] for row in conn.execute("PRAGMA table_info(progress)").fetchall()}
        if "char_offset" not in cols:
            conn.execute("ALTER TABLE progress ADD COLUMN char_offset INTEGER NOT NULL DEFAULT 0")
        if "chapter_text_hash" not in cols:
            conn.execute("ALTER TABLE progress ADD COLUMN chapter_text_hash TEXT")
        conn.commit()
