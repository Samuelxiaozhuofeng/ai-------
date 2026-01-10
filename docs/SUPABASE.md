# Supabase Setup (Cloud Sync)

## 1) Create a Supabase project
- Enable Email auth (or your preferred provider) in `Authentication`.
- Get `Project URL` and `anon public` key from `Project Settings → API`.

## 2) Apply SQL schema
- Open `SQL Editor` and run `supabase/schema.sql`.

## 3) Configure environment in the frontend
This project is plain HTML + ES Modules (no bundler). The browser can't read `.env` directly, so use `env.js`:

- Copy `env.example.js` → `env.js`
- Fill in:
  - `YOUR_SUPABASE_URL`
  - `YOUR_SUPABASE_ANON_KEY`

`env.js` is gitignored by default.

## 4) Enable sync in-app
- Open the app
- Click `🔐 登录` and sign in
- Open `⚙️ 设置 → 🔄 同步` and enable `syncEnabled`

## Notes
- EPUB files upload to Supabase Storage bucket `epubs` under `<user_id>/<book_id>.epub`.
- Existing IndexedDB books imported before this change do not contain the original EPUB file; to sync those books across devices you must re-upload the EPUB.

