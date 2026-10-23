# 句型日练 · Pattern Daily

每天 15 分钟的英语强化训练，结合两种方法：
- **Tim Ferriss 的「12 句解构法」**（Deconstruction Dozen）：用 apple / John 这样的"假人词"看清英语骨架，包括语序、代词、时态、疑问倒装、否定和情态动词。
- **Harold Palmer 的「替换表」**（Substitution Tables，又叫母框、"乐高替换法"）：固定句子骨架，逐列替换词块，通过大量操练把句型变成脱口而出的反射。

**在线使用：https://eric717273.github.io/pattern-daily/**

方法分析见 [research/METHODS.md](research/METHODS.md)，架构说明见 [ARCHITECTURE.md](ARCHITECTURE.md)。

## 每日流程（第 N 课）
1. **热身复习**：按 SM-2 间隔重复，复习到期的卡片。
2. **解构**：学习当天的解构句，看中英逐字对照和文法陷阱，再做语序重建练习。
3. **母框替换**（帕默三步）：
   - 锚定跟读；
   - 单槽快替（语音验证：限时说出替换后的整句，自动判定对错；也可选自评模式）；
   - 中译英（逐词比对你的答案）。
4. **模组替换输出**：用当天的骨架自己造 3 句，交给 DeepSeek AI 批改；没有配置 AI 时用参考答案自评。

前 13 课逐句攻克 12 句加 1 句彩蛋，第 14–30 课以母框为主，之后进入维护期。课程按**完成的课数**推进，漏练一天不会跳过内容。

其他功能：
- 12 句详解、100 个内置母框（可交互的替换表，覆盖日常、职场、旅行、社交、学习）；
- AI 生成新母框；
- AI 解构任意句子（视频中的"10 分钟看清骨架"）；
- 学习统计和热力图、数据备份。

## 平台
这是一个 PWA，一套代码同时用于 iPhone 和 Mac：
- **iPhone**：用 Safari 打开网址，点"分享"，再点"添加到主屏幕"。
- **Mac**：用 Safari 打开网址，点菜单"文件"，再点"添加到程序坞"。

数据保存在本地，可以离线使用。可选配置 Supabase，实现两台设备之间的同步。

## 开发
```bash
cd app
npm install
npm run dev          # 本地开发
npm test             # 单元测试（Vitest）
npm run e2e          # 端到端测试（Playwright，iPhone + 桌面视口）
npm run build        # 生产构建，输出到 app/dist
```

## 部署与配置
1. **托管**：推送到 GitHub 后，`.github/workflows/deploy.yml` 会自动构建并部署到 GitHub Pages（需要在仓库的 Settings → Pages 中把 Source 设为 GitHub Actions）。
2. **同步（可选）**：按 [docs/SETUP.md](docs/SETUP.md) 创建免费的 Supabase 项目，并执行 `supabase/migrations/0001_init.sql`。然后可以选择以下任一方式填入项目信息：
   - 在 App 的"我的"页面里填写；
   - 在仓库的 Settings → Variables 中设置 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY`。
3. **AI**：在 App 的"我的"页面中填入 DeepSeek API Key（在 https://platform.deepseek.com/api_keys 获取）。默认直连模式下，Key 只保存在当前设备。如果浏览器直连失败，可以改用 Supabase 代理模式，见 docs/SETUP.md。

## 目录
```
research/   方法分析与视频元数据
app/        PWA 源码（React + TypeScript + Vite）
supabase/   数据库迁移 + AI 代理 Edge Function
docs/       部署与配置说明
```
