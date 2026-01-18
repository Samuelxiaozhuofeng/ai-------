# Language Reader (Intelligent Reader)

A LingQ-style language learning EPUB reader:
- Page-flip reading (←/→ to turn pages)
- Click words to track status: `new` → `learning` → `known`
- Optional AI word analysis
- Optional cloud sync via Supabase (Auth + Postgres + Storage)
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

## Enable Sync (Optional)

### Supabase (Recommended)
- Follow `docs/SUPABASE.md`
- In the app: click `🔐 登录` then enable sync in `⚙️ 设置 → 🔄 同步`

### FastAPI (Legacy / Deprecated)
In Reader → Settings → `同步` you can still set `Backend URL` and enable sync.

## Word Status Guide

- `new`: default for words not saved; shown with blue dotted underline
- `learning`: saved for study; shown with yellow highlight
- `known`: marked as mastered; shown as normal text

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
- `POST /api/v1/sync`
