# 配置指南：双端同步 + AI

句型日练不配置任何东西也能完整使用（数据存在本机，离线可用）。下面两项都是可选的：

- **Supabase**：让 iPhone 和 Mac 之间同步学习进度。
- **DeepSeek**：开启 AI 批改、AI 解构句子、AI 生成母框和每日造句题。

---

## 一、创建 Supabase 项目（免费套餐即可）

1. 打开 <https://supabase.com>，注册并登录，点击 **New project**。
2. 填写项目名（如 `pattern-daily`）、数据库密码（随便设一个并保存好）、选离你近的区域（如 Singapore / Tokyo），选择 **Free** 套餐，创建。等一两分钟初始化完成。

### 1. 运行数据库迁移

1. 左侧菜单进入 **SQL Editor** → **New query**。
2. 打开仓库里的 `supabase/migrations/0001_init.sql`，把全部内容复制粘贴进去，点击 **Run**。
3. 看到 `Success. No rows returned` 即成功。可到 **Table Editor** 确认出现了 `records` 表。脚本可重复执行。

### 2. 开启邮箱「6 位验证码」登录

应用使用邮箱验证码登录（不是魔法链接）：iPhone 主屏幕里的 PWA 无法接收魔法链接的跳转，所以必须用验证码。

1. 进入 **Authentication → Sign In / Providers**，确认 **Email** 已启用（默认启用）。
2. 进入 **Authentication → Email Templates**（新版界面在 **Authentication → Emails**），打开 **Magic Link** 模板。
3. 把邮件正文改成包含验证码，例如：

   ```html
   <h2>句型日练 登录验证码</h2>
   <p>你的 6 位验证码是：</p>
   <p style="font-size:28px;letter-spacing:6px"><b>{{ .Token }}</b></p>
   <p>10 分钟内有效。如果不是你本人操作，请忽略这封邮件。</p>
   ```

   关键是必须包含 `{{ .Token }}`。保存。
4. 若是首次注册的邮箱，Supabase 发的是 **Confirm signup** 模板；也请用同样方式把它改成包含 `{{ .Token }}`。
5. 免费套餐自带的邮件服务有发送频率限制（每小时几封），个人使用足够；若提示发送过于频繁，请等一会儿再试。

### 3. 获取 URL 和 anon key

进入 **Project Settings → API**（或 **Data API / API Keys**）：

- **Project URL**：形如 `https://xxxxxxxx.supabase.co`
- **anon / public key**（也叫 publishable key）：一长串字符

> 只用 anon key，不要把 `service_role` key 填进应用。anon key 可以公开，数据靠行级安全策略（RLS）保护，每个用户只能读写自己的行。

### 4. 在应用里填写

打开应用 → **设置 → 同步**：填入 Project URL 和 anon key，输入邮箱，点「发送验证码」，到邮箱里取 6 位数字填回，即登录成功。**在 iPhone 和 Mac 上都用同一个邮箱登录**，之后两端会自动同步（本地改动 3 秒后、回到前台、恢复联网、以及每 60 秒都会触发）。

> 也可以在构建时通过环境变量 `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` 预置这两个值，应用内未填写时会自动使用。

---

## 二、配置 DeepSeek AI

1. 到 <https://platform.deepseek.com> 注册，充值少量余额（AI 批改一次只需几分之一分钱），在 **API keys** 中创建 Key（形如 `sk-...`）。
2. 打开应用 → **设置 → AI**，把 Key 粘贴到「DeepSeek API Key」，点「测试连接」。模型默认 `deepseek-chat`。

### 两种模式

| 模式 | Key 存放位置 | 说明 |
|---|---|---|
| **直连（direct，默认）** | 只保存在**当前设备**的浏览器本地存储里 | 简单，不依赖 Supabase。**每台设备（iPhone、Mac）都要各填一次 Key**，Key 不会被同步。 |
| **服务器代理（proxy）** | 保存在 Supabase 服务器的 secret 里 | 设备上不用填 Key，两端共用；需要先配置并登录 Supabase，并部署下面的 `ai-proxy` 函数。 |

> **如果直连模式测试连接时提示「跨域（CORS）」或「无法连接」**：说明浏览器被 DeepSeek 的跨域策略拦截了。请改用**服务器代理模式**。

### 部署 ai-proxy（可选，用于代理模式）

需要先安装 [Supabase CLI](https://supabase.com/docs/guides/cli)（Mac：`brew install supabase/tap/supabase`），然后在仓库根目录执行：

```bash
supabase login
supabase link --project-ref <你的项目 ref，即 URL 里 xxxxxxxx 那一段>
supabase secrets set DEEPSEEK_API_KEY=sk-你的key
supabase functions deploy ai-proxy
```

部署后到应用 **设置 → AI**，把模式切换为「服务器代理」，登录同步账号后点「测试连接」。

说明：

- 函数会校验调用者的登录状态（必须是已登录用户），只放行 `deepseek-chat` 与 `deepseek-reasoner` 两个模型，并把单次输出限制在 4096 token 以内（`deepseek-reasoner` 为 8192，因为推理过程也计入输出），防止被滥用。
- 修改 secret 后无需重新部署，立即生效。

---

## 常见问题

- **收不到验证码**：检查垃圾邮件箱；确认 Magic Link / Confirm signup 模板中包含 `{{ .Token }}`；免费邮件服务有频率限制，稍后再试。
- **两台设备数据不一致**：同步以「最后修改者胜出」为准；点设置里的「立即同步」，并确认两端登录的是同一个邮箱。
- **换了 Supabase 项目**：在设置里填新的 URL 和 anon key，重新登录即可（旧项目的数据不会自动迁移）。
- **iPhone 添加到主屏幕后登录状态丢失**：主屏幕 PWA 与 Safari 标签页的存储是分开的，需要在主屏幕版里再登录一次。
