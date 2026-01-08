# Language Reader (Intelligent Reader)

A LingQ-style language learning EPUB reader:
- Page-flip reading (←/→ to turn pages)
- Click words to track status: `new` → `learning` → `known`
- Optional AI word analysis + Anki export
- Optional FastAPI + SQLite backend to sync vocabulary and reading progress

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

### Local Python

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

## Enable Sync (Optional)

In Reader → Settings → `同步`:
- Set `Backend URL` (default `http://localhost:8000`)
- Enable sync and click `Sync Now`

## Word Status Guide

- `new`: default for words not saved; shown with blue dotted underline
- `learning`: saved for study; shown with yellow highlight
- `known`: marked as mastered; shown as normal text

Click a word in the reader to open it in the Vocabulary panel, then use:
- `加入学习` → `learning`
- `标记已掌握` → `known`
- `移除` → back to `new`

## Backend API (Summary)

- `GET /health`
- `GET /api/v1/vocabulary`
- `POST /api/v1/vocabulary`
- `PUT /api/v1/vocabulary/{id}`
- `DELETE /api/v1/vocabulary/{id}`
- `GET /api/v1/progress/{book_id}`
- `PUT /api/v1/progress/{book_id}`
- `POST /api/v1/sync`
