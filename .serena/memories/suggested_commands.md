# 常用命令

## 前端（静态站点）
- 启动静态服务：`python3 -m http.server 5173`
- 访问：`http://localhost:5173/`

## 后端（可选）
- Docker Compose：`docker compose up`
- 本地 FastAPI：
  - `cd backend`
  - `python -m venv .venv`
  - `source .venv/bin/activate`
  - `pip install -r requirements.txt`
  - `uvicorn main:app --reload --port 8000`

## Worker（Sudachi 分词）
- `cp .env.example .env`，补齐 Supabase 变量后：`docker compose up --build worker`
- Node 脚本：`cd worker && npm run start`
