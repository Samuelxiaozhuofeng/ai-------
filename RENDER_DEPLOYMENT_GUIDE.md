# Render 部署教程：零运维部署日语分词 Worker

## 🎯 目标

将你的 Worker 服务部署到 Render 云平台，实现：
- ✅ 完全免费（在免费额度内）
- ✅ 24/7 自动运行
- ✅ 零本地运维
- ✅ 自动从 GitHub 部署

---

## 📋 前提条件

1. **GitHub 账号**（用于托管代码）
2. **Render 账号**（免费注册：https://render.com）
3. **Supabase 项目**（需要获取环境变量）

---

## 🚀 部署步骤

### 步骤 1：准备 Supabase 环境变量

登录你的 Supabase 项目，获取以下信息：

1. **进入项目设置**：
   - 打开 https://supabase.com/dashboard
   - 选择你的项目
   - 点击左侧菜单 **Settings** → **API**

2. **复制以下信息**：
   ```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```

   ⚠️ **注意**：这是 **Service Role Key**（不是 anon key），有完整权限，务必保密！

---

### 步骤 2：推送代码到 GitHub

如果你的代码还没推送到 GitHub：

```bash
# 在项目根目录
git add .
git commit -m "准备部署到 Render"
git push origin main
```

如果还没创建 GitHub 仓库：

```bash
# 1. 在 GitHub 网站创建新仓库（比如叫 intelligent-reader）
# 2. 在本地执行：
git remote add origin https://github.com/你的用户名/intelligent-reader.git
git branch -M main
git push -u origin main
```

---

### 步骤 3：在 Render 创建服务

#### 3.1 注册 / 登录 Render

访问 https://render.com，使用 GitHub 账号登录（推荐）。

#### 3.2 创建新的 Web Service

1. 点击 **Dashboard** 右上角的 **New +**
2. 选择 **Background Worker**（后台工作进程）
3. **Connect a repository**：
   - 点击 **Connect GitHub**
   - 授权 Render 访问你的仓库
   - 选择 `intelligent-reader` 仓库

#### 3.3 配置服务

填写以下信息：

| 字段 | 填写内容 |
|------|---------|
| **Name** | `intelligent-reader-worker`（可自定义） |
| **Region** | 选择 **Singapore** 或 **Oregon**（离你较近的） |
| **Branch** | `main` |
| **Root Directory** | `worker` |
| **Runtime** | **Docker** |
| **Instance Type** | **Free** |

#### 3.4 设置环境变量

点击 **Advanced**，然后添加环境变量：

| Key | Value | 说明 |
|-----|-------|------|
| `SUPABASE_URL` | `https://your-project.supabase.co` | 你的 Supabase 项目 URL |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGci...` | Service Role Key |
| `SUPABASE_BUCKET` | `epubs` | 存储桶名称（默认） |
| `POLL_INTERVAL_MS` | `1500` | 轮询间隔（毫秒） |
| `MAX_ATTEMPTS` | `5` | 最大重试次数 |

⚠️ **重要**：点击每个环境变量右侧的 **🔒 锁图标**，将敏感信息标记为 Secret。

#### 3.5 开始部署

1. 点击底部的 **Create Background Worker**
2. Render 会自动：
   - 拉取你的 GitHub 代码
   - 构建 Docker 镜像（约 3-5 分钟）
   - 启动 Worker 服务

---

### 步骤 4：验证部署

#### 4.1 查看日志

在 Render Dashboard 中：
1. 点击你的 `intelligent-reader-worker` 服务
2. 查看 **Logs** 标签
3. 应该看到类似输出：
   ```
   Worker worker-12345 started
   Polling for jobs...
   ```

#### 4.2 测试分词功能

1. **上传日语 EPUB**：
   - 在你的前端应用上传一本日语书籍
   - 查看 Render Logs，应该看到：
     ```
     Claimed job for book abc123
     Processing EPUB...
     Tokenizing Japanese text...
     Upload complete
     ```

2. **检查 Supabase Storage**：
   - 进入 Supabase Dashboard → Storage → `epubs` bucket
   - 应该看到 `{userId}/{bookId}/processed/` 目录
   - 里面有 `manifest.json.gz` 和 `tokens/{chapterId}.json.gz`

3. **前端测试**：
   - 刷新书架，书籍状态应该变为 `completed`
   - 打开阅读器，词汇应该正常显示

---

## 🔧 常见问题

### Q1: 构建失败怎么办？

**错误提示**：`Error: Cannot find module 'xxx'`

**解决方法**：
1. 确保 `worker/package.json` 包含所有依赖
2. 检查 `worker/requirements.txt` 是否存在
3. 查看完整日志，搜索具体错误信息

---

### Q2: Worker 运行但不处理任务

**可能原因**：
- 环境变量配置错误
- Supabase RPC 函数未部署
- 数据库权限问题

**排查步骤**：
1. 在 Render Logs 中搜索 `Error` 或 `Failed`
2. 检查 Supabase Dashboard → Database → Functions，确认 `claim_book_processing_job` 存在
3. 测试环境变量：在 Render Shell 中运行：
   ```bash
   echo $SUPABASE_URL
   echo $SUPABASE_SERVICE_ROLE_KEY
   ```

---

### Q3: 免费额度会用完吗？

**Render Free Plan 限制**：
- ✅ 750 小时/月（约 31 天 × 24 小时）
- ✅ 512MB RAM
- ✅ 0.1 CPU

**你的 Worker**：
- 持续运行（750 小时刚好够一个月）
- 内存占用约 100-200MB（够用）
- CPU 使用率低（仅在分词时高）

**结论**：**完全够用**，不会超额。

---

### Q4: 如何更新代码？

非常简单！只需：

```bash
# 本地修改代码后
git add .
git commit -m "更新分词逻辑"
git push origin main
```

Render 会**自动检测到推送**，并重新构建和部署（约 3-5 分钟）。

---

### Q5: 如何查看实时日志？

1. 进入 Render Dashboard
2. 选择你的 Worker 服务
3. 点击 **Logs** 标签
4. 勾选 **Auto-scroll**（自动滚动）

---

### Q6: 如果需要暂停 Worker

在 Render Dashboard 中：
1. 选择服务
2. 点击右上角 **⋮** → **Suspend**
3. 需要时再点 **Resume**

---

## 🎉 完成！

现在你的系统架构是：

```
用户 → 前端 → Supabase → Render Worker → Supabase Storage
                                ↓
                         SudachiPy 分词
```

**完全云端化，零本地运维！**

---

## 📊 监控建议

### 设置 Render 通知

1. 进入 Render Dashboard → Settings → Notifications
2. 添加你的邮箱
3. 勾选：
   - ✅ Deploy Failed
   - ✅ Service Crashed
   - ✅ Memory Limit Exceeded

这样出现问题时会立即邮件通知你。

---

## 🔐 安全建议

1. ✅ **永远不要** 将 `SUPABASE_SERVICE_ROLE_KEY` 提交到 Git
2. ✅ 在 Render 中标记敏感变量为 Secret
3. ✅ 定期轮换 Service Role Key（Supabase Dashboard → Settings → API）
4. ✅ 启用 GitHub 的 2FA 认证

---

## 📞 获取帮助

- **Render 文档**：https://render.com/docs
- **Render 社区**：https://community.render.com
- **Supabase 文档**：https://supabase.com/docs

---

**祝你部署顺利！现在可以享受纯云端的日语阅读体验了！** 🚀📚
