from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from db import db_conn, init_db


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def parse_iso(value: str) -> datetime:
    try:
        if value.endswith("Z"):
            return datetime.fromisoformat(value[:-1] + "+00:00")
        return datetime.fromisoformat(value)
    except Exception:
        return datetime.min.replace(tzinfo=timezone.utc)


class VocabularyBase(BaseModel):
    book_id: str = Field(..., alias="bookId")
    word: str
    status: str
    context: Optional[dict[str, Any]] = None
    analysis: Optional[dict[str, Any]] = None
    display_word: Optional[str] = Field(default=None, alias="displayWord")
    source_chapter_id: Optional[str] = Field(default=None, alias="sourceChapterId")
    created_at: Optional[str] = Field(default=None, alias="createdAt")
    updated_at: Optional[str] = Field(default=None, alias="updatedAt")

    class Config:
        populate_by_name = True


class VocabularyCreate(VocabularyBase):
    pass


class VocabularyUpdate(BaseModel):
    status: Optional[str] = None
    context: Optional[dict[str, Any]] = None
    analysis: Optional[dict[str, Any]] = None
    display_word: Optional[str] = Field(default=None, alias="displayWord")
    source_chapter_id: Optional[str] = Field(default=None, alias="sourceChapterId")
    updated_at: Optional[str] = Field(default=None, alias="updatedAt")

    class Config:
        populate_by_name = True


class VocabularyOut(VocabularyBase):
    id: str
    created_at: str = Field(..., alias="createdAt")
    updated_at: str = Field(..., alias="updatedAt")


class ProgressUpsert(BaseModel):
    chapter_id: Optional[str] = Field(default=None, alias="chapterId")
    page_number: int = Field(default=0, alias="pageNumber")
    scroll_position: int = Field(default=0, alias="scrollPosition")
    updated_at: Optional[str] = Field(default=None, alias="updatedAt")

    class Config:
        populate_by_name = True


class SyncRequest(BaseModel):
    vocabulary: list[dict[str, Any]] = Field(default_factory=list)


class SyncResponse(BaseModel):
    vocabulary: list[dict[str, Any]]
    synced_at: str = Field(..., alias="syncedAt")

    class Config:
        populate_by_name = True


app = FastAPI(title="Language Reader Backend", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup():
    init_db()


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/api/v1/vocabulary", response_model=list[VocabularyOut])
def list_vocabulary():
    with db_conn() as conn:
        rows = conn.execute("SELECT * FROM vocabulary ORDER BY updated_at DESC").fetchall()
    return [
        {
            "id": r["id"],
            "bookId": r["book_id"],
            "word": r["word"],
            "status": r["status"],
            "context": json.loads(r["context_json"]) if r["context_json"] else None,
            "analysis": json.loads(r["analysis_json"]) if r["analysis_json"] else None,
            "displayWord": r["display_word"],
            "sourceChapterId": r["source_chapter_id"],
            "createdAt": r["created_at"],
            "updatedAt": r["updated_at"],
        }
        for r in rows
    ]


@app.post("/api/v1/vocabulary", response_model=VocabularyOut, status_code=201)
def create_vocabulary(payload: VocabularyCreate):
    record_id = str(uuid4())
    created_at = payload.created_at or now_iso()
    updated_at = payload.updated_at or created_at

    with db_conn() as conn:
        conn.execute(
            """
            INSERT INTO vocabulary (
              id, book_id, word, status, context_json, analysis_json,
              display_word, source_chapter_id, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                record_id,
                payload.book_id,
                payload.word,
                payload.status,
                json.dumps(payload.context) if payload.context else None,
                json.dumps(payload.analysis) if payload.analysis else None,
                payload.display_word,
                payload.source_chapter_id,
                created_at,
                updated_at,
            ),
        )
        conn.commit()

    return {
        "id": record_id,
        "bookId": payload.book_id,
        "word": payload.word,
        "status": payload.status,
        "context": payload.context,
        "analysis": payload.analysis,
        "displayWord": payload.display_word,
        "sourceChapterId": payload.source_chapter_id,
        "createdAt": created_at,
        "updatedAt": updated_at,
    }


@app.put("/api/v1/vocabulary/{vocab_id}", response_model=VocabularyOut)
def update_vocabulary(vocab_id: str, payload: VocabularyUpdate):
    with db_conn() as conn:
        existing = conn.execute("SELECT * FROM vocabulary WHERE id = ?", (vocab_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Vocabulary item not found")

        updated_at = payload.updated_at or now_iso()
        status = payload.status or existing["status"]
        context_json = (
            json.dumps(payload.context)
            if payload.context is not None
            else existing["context_json"]
        )
        analysis_json = (
            json.dumps(payload.analysis)
            if payload.analysis is not None
            else existing["analysis_json"]
        )
        display_word = payload.display_word if payload.display_word is not None else existing["display_word"]
        source_chapter_id = payload.source_chapter_id if payload.source_chapter_id is not None else existing["source_chapter_id"]

        conn.execute(
            """
            UPDATE vocabulary
            SET status = ?, context_json = ?, analysis_json = ?, display_word = ?, source_chapter_id = ?, updated_at = ?
            WHERE id = ?
            """,
            (status, context_json, analysis_json, display_word, source_chapter_id, updated_at, vocab_id),
        )
        conn.commit()

        updated = conn.execute("SELECT * FROM vocabulary WHERE id = ?", (vocab_id,)).fetchone()

    return {
        "id": updated["id"],
        "bookId": updated["book_id"],
        "word": updated["word"],
        "status": updated["status"],
        "context": json.loads(updated["context_json"]) if updated["context_json"] else None,
        "analysis": json.loads(updated["analysis_json"]) if updated["analysis_json"] else None,
        "displayWord": updated["display_word"],
        "sourceChapterId": updated["source_chapter_id"],
        "createdAt": updated["created_at"],
        "updatedAt": updated["updated_at"],
    }


@app.delete("/api/v1/vocabulary/{vocab_id}", status_code=204)
def delete_vocabulary(vocab_id: str):
    with db_conn() as conn:
        conn.execute("DELETE FROM vocabulary WHERE id = ?", (vocab_id,))
        conn.commit()
    return Response(status_code=204)


@app.get("/api/v1/progress/{book_id}")
def get_progress(book_id: str):
    with db_conn() as conn:
        row = conn.execute("SELECT * FROM progress WHERE book_id = ?", (book_id,)).fetchone()
    if not row:
        return {}
    return {
        "bookId": row["book_id"],
        "chapterId": row["chapter_id"],
        "pageNumber": row["page_number"],
        "scrollPosition": row["scroll_position"],
        "updatedAt": row["updated_at"],
    }


@app.put("/api/v1/progress/{book_id}")
def put_progress(book_id: str, payload: ProgressUpsert):
    updated_at = payload.updated_at or now_iso()
    with db_conn() as conn:
        conn.execute(
            """
            INSERT INTO progress (book_id, chapter_id, page_number, scroll_position, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(book_id) DO UPDATE SET
              chapter_id = excluded.chapter_id,
              page_number = excluded.page_number,
              scroll_position = excluded.scroll_position,
              updated_at = excluded.updated_at
            """,
            (book_id, payload.chapter_id, payload.page_number, payload.scroll_position, updated_at),
        )
        conn.commit()
    return {"ok": True, "updatedAt": updated_at}


@app.post("/api/v1/sync", response_model=SyncResponse)
def sync(payload: SyncRequest):
    incoming = []
    for raw in payload.vocabulary:
        # Accept either the backend shape or frontend IndexedDB shape
        item = raw.copy()
        if "bookId" in item and "book_id" not in item:
            item["book_id"] = item["bookId"]
        if "displayWord" in item and "display_word" not in item:
            item["display_word"] = item["displayWord"]
        if "sourceChapterId" in item and "source_chapter_id" not in item:
            item["source_chapter_id"] = item["sourceChapterId"]
        if "createdAt" in item and "created_at" not in item:
            item["created_at"] = item["createdAt"]
        if "updatedAt" in item and "updated_at" not in item:
            item["updated_at"] = item["updatedAt"]

        if not item.get("id"):
            item["id"] = str(uuid4())
        if not item.get("created_at"):
            item["created_at"] = now_iso()
        if not item.get("updated_at"):
            item["updated_at"] = item["created_at"]

        incoming.append(item)

    with db_conn() as conn:
        for item in incoming:
            existing = conn.execute("SELECT updated_at FROM vocabulary WHERE id = ?", (item["id"],)).fetchone()
            should_write = True
            if existing:
                should_write = parse_iso(item["updated_at"]) > parse_iso(existing["updated_at"])

            if not should_write:
                continue

            conn.execute(
                """
                INSERT INTO vocabulary (
                  id, book_id, word, status, context_json, analysis_json,
                  display_word, source_chapter_id, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                  book_id = excluded.book_id,
                  word = excluded.word,
                  status = excluded.status,
                  context_json = excluded.context_json,
                  analysis_json = excluded.analysis_json,
                  display_word = excluded.display_word,
                  source_chapter_id = excluded.source_chapter_id,
                  created_at = excluded.created_at,
                  updated_at = excluded.updated_at
                """,
                (
                    item["id"],
                    item["book_id"],
                    item["word"],
                    item.get("status", "learning"),
                    json.dumps(item.get("context")) if item.get("context") else None,
                    json.dumps(item.get("analysis")) if item.get("analysis") else None,
                    item.get("display_word"),
                    item.get("source_chapter_id"),
                    item["created_at"],
                    item["updated_at"],
                ),
            )
        conn.commit()

        rows = conn.execute("SELECT * FROM vocabulary ORDER BY updated_at DESC").fetchall()

    vocab_out = [
        {
            "id": r["id"],
            "bookId": r["book_id"],
            "word": r["word"],
            "status": r["status"],
            "context": json.loads(r["context_json"]) if r["context_json"] else None,
            "analysis": json.loads(r["analysis_json"]) if r["analysis_json"] else None,
            "displayWord": r["display_word"],
            "sourceChapterId": r["source_chapter_id"],
            "createdAt": r["created_at"],
            "updatedAt": r["updated_at"],
        }
        for r in rows
    ]

    return {"vocabulary": vocab_out, "syncedAt": now_iso()}

