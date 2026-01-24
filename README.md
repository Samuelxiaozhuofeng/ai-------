# Language Reader (Intelligent Reader)

A LingQ-style language learning EPUB reader:
- Page-flip reading (←/→ to turn pages)
- Click words to track status: `new` → `learning` → `known`
- Optional AI word analysis
- Cloud storage via Supabase (Auth + Postgres + Storage)
- Legacy optional FastAPI + SQLite backend (deprecated)

## Run (Frontend)

Serve the repo as static files (any static server works):

```bash
python3 -m http.server 5173
```

Then open `http://localhost:5173/`.

## Run (Backend, Optional)

### Docker Compose

```bash
docker compose up
```
1

Backend runs on `http://localhost:8000`.

### Worker (Sudachi Japanese tokenization)

The `worker` service is responsible for cloud book processing + Japanese tokenization and requires Supabase credentials.

```bash
cp .env.example .env
# edit .env and set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
docker compose up --build worker
```

### Local Python

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

## Supabase Setup

- Follow `docs/SUPABASE.md`
- Sign in with `🔐 登录` to access your cloud library

## Word Status Guide

- `new`: default for words not saved; shown with blue dotted underline
- `learning`: saved for study; shown with yellow highlight
- `known`: marked as mastered; shown as normal text
- Known words are shared across books of the same language.
- Bookshelf header shows Known Words stats with a detail modal (search, language filter, pagination).
- 自动加入学习：开启后，点击单词会加入学习；判断以本书本地状态为准（已掌握也会加入，已在学习中不重复加入）。

## Data Management

Use Settings → 数据管理 to erase all books, vocabulary, progress, and local settings while keeping your account.
设置 → 数据管理新增“清除分页缓存”，用于解决分页错乱或释放本地存储。

Click a word in the reader to open it in the Vocabulary panel, then use:
- `加入学习` → `learning`
- `标记已掌握` → `known`
- `移除` → back to `new`

## Security Updates

- 2026-01-18: Added explicit `search_path` for Supabase RPC helpers to address mutable search_path warnings.

## Backend API (Summary)

This is the legacy FastAPI backend (deprecated when using Supabase).

- `GET /health`
- `GET /api/v1/vocabulary`
- `POST /api/v1/vocabulary`
- `PUT /api/v1/vocabulary/{id}`
- `DELETE /api/v1/vocabulary/{id}`
- `GET /api/v1/progress/{book_id}`
- `PUT /api/v1/progress/{book_id}`
