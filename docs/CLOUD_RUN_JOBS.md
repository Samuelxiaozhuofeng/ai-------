# Cloud Run Jobs 部署 Worker（零服务器运维）

本项目的 `worker/` 是一个“离线任务处理器”：从 Supabase 数据库里 claim 任务、下载 EPUB、解析章节、（日语）分词、把结果写回 Supabase Storage。

在 Google Cloud 上推荐使用 **Cloud Run Jobs + Cloud Scheduler**：
- Cloud Run Jobs：按需运行容器，跑完退出
- Cloud Scheduler：定时触发 Job（例如每分钟一次），实现“近实时”自动处理

## 1) 前置条件

- 你有一个 GCP Project（需要绑定结算账号；Cloud Run 有 free tier，但无法保证永远 0 费用）
- Supabase 项目已配置好数据库函数与队列表（见 `supabase/schema.sql`）
- 你有 Supabase `service_role` key（只放在服务器侧/Cloud Run 环境变量里）

## 2) Worker 改为 Job 模式

Cloud Run Jobs 期望容器“跑完退出”，所以需要设置：

- `WORKER_MODE=job`
- `MAX_JOBS=1`（每次 Job 运行最多处理几个任务；你也可以设为 2/3 以减少触发频率）

容器没有任务时会输出 “no jobs available; exiting” 并正常退出（exit 0）。

## 3) 构建并推送镜像

在仓库根目录执行（示例使用 Artifact Registry）：

```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudscheduler.googleapis.com

gcloud artifacts repositories create intelligent-reader \
  --repository-format=docker \
  --location=us-central1

gcloud auth configure-docker us-central1-docker.pkg.dev

docker build -t us-central1-docker.pkg.dev/YOUR_PROJECT_ID/intelligent-reader/worker:latest ./worker
docker push us-central1-docker.pkg.dev/YOUR_PROJECT_ID/intelligent-reader/worker:latest
```

如果你本机没有 Docker，可以直接用 Cloud Build（同样需要启用 `cloudbuild.googleapis.com`）：

```bash
gcloud services enable cloudbuild.googleapis.com
gcloud builds submit --tag us-central1-docker.pkg.dev/YOUR_PROJECT_ID/intelligent-reader/worker:latest ./worker
```

如果 Cloud Build 在安装 Python 包时报 `externally-managed-environment`（PEP 668），请确保 `worker/Dockerfile` 的 pip 安装命令带 `--break-system-packages`（本仓库已加）。

## 4) 创建 Cloud Run Job

```bash
gcloud run jobs create intelligent-reader-worker \
  --region=us-central1 \
  --image=us-central1-docker.pkg.dev/YOUR_PROJECT_ID/intelligent-reader/worker:latest \
  --tasks=1 \
  --max-retries=1 \
  --set-env-vars=WORKER_MODE=job,MAX_JOBS=1,SUPABASE_BUCKET=epubs,POLL_INTERVAL_MS=1500,MAX_ATTEMPTS=5 \
  --set-env-vars=SUPABASE_URL=YOUR_SUPABASE_URL \
  --set-env-vars=SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
```

建议把 `SUPABASE_SERVICE_ROLE_KEY` 改为 Secret Manager 注入（避免明文出现在命令历史里）。

## 5) 手动触发测试

```bash
gcloud run jobs execute intelligent-reader-worker --region=us-central1
gcloud run jobs executions list --job=intelligent-reader-worker --region=us-central1
```

查看执行日志（Console → Cloud Run → Jobs → Executions → Logs）。

## 6) 配置定时触发（Cloud Scheduler）

每分钟触发一次（需要给 Scheduler 一个能执行 Job 的权限）。推荐用 Cloud Scheduler 直接调用 Cloud Run Jobs 的 `:run` API：

```bash
# 1) 准备一个 service account 作为 scheduler 调用方
gcloud iam service-accounts create scheduler-invoker

# 2) 赋权：允许它运行 Cloud Run Job（简单起见给 project 级 roles/run.developer；也可改成 job 级）
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:scheduler-invoker@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/run.developer"

# 3) 创建每分钟触发的 Scheduler（HTTP target）
gcloud scheduler jobs create http intelligent-reader-worker-every-minute \
  --location=us-central1 \
  --schedule="*/1 * * * *" \
  --time-zone="UTC" \
  --uri="https://run.googleapis.com/v2/projects/YOUR_PROJECT_ID/locations/us-central1/jobs/intelligent-reader-worker:run" \
  --http-method=POST \
  --oauth-service-account-email="scheduler-invoker@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --oauth-token-scope="https://www.googleapis.com/auth/cloud-platform"
```

如果你用的是其他 region 或 job 名称，请相应替换 `--location` 和 `--uri`。

1. 创建一个 Service Account（例如 `scheduler-invoker`）
2. 给它 `Cloud Run Invoker` / `Cloud Run Admin`（按你选择的触发方式而定）
3. 创建 Scheduler HTTP 任务，调用 Cloud Run Jobs 的 execute endpoint（Console 操作最简单）

如果你希望我给出完全命令行版本，请告诉我你的 region、job 名称和偏好的权限策略。

## 7) 调参建议

- 任务堆积时：提高 `MAX_JOBS` 或提高 Scheduler 频率
- 处理大书时：提高 Job timeout（Console 可配）
- 成本控制：让 Job 尽快退出；尽量避免空转常驻服务
