# 句型日练 · Pattern Daily

每天 15 分钟的英语强化训练，分成**两条互相独立的学习线**：

| | 解码线 | 语块线 |
|---|---|---|
| 方法 | Tim Ferriss「12 句解构法」 | Harold Palmer「替换表」+ 现代语块研究 |
| 练什么 | **看懂**：语序、代词、时态、倒装、否定、情态 | **脱口而出、听到就懂**：高频句式与语块的自动化 |
| 内容 | 13 个骨架句 + 78 道变形练习 + 成分标注 + AI 解构 | 400 条语块：150 个可替换母框 + 250 条固定表达，按 20 个交际功能分类 |
| 节奏 | 前 13 课每天一个骨架，之后每天约 3 分钟维护 | 每天 5 条新语块（可调 3–10）+ 间隔复习 |

两条线不混在一起：练语块时不讲语法；卡住时可以点「看结构」，临时用解码视角看一眼。

**在线使用：https://eric717273.github.io/pattern-daily/**

方法分析见 [research/METHODS.md](research/METHODS.md)，内容规范见 [research/CONTENT-GUIDE.md](research/CONTENT-GUIDE.md)，架构说明见 [ARCHITECTURE.md](ARCHITECTURE.md)。

## 每日流程（第 N 课，约 15 分钟）
1. **复习**：到期语块的间隔复习，先听辨，再说出。
2. **新语块**：每条依次练三步：
   - 固定表达：听辨（正常语速四选一）、跟读（语音验证）、限时说出；
   - 母框：听辨、锚定跟读、单槽快替（限时说出替换后的整句）。
3. **解码**：前 13 课每天学一个骨架（逐字对照、排语序、变形），之后每天做一组变形练习或成分标注。
4. **输出**：AI 根据今天的语块出 3 道情景题，你用语块说或写出来，由 DeepSeek 批改；没配置 AI 时对照参考答案自查。

课程按**完成的课数**推进，漏练一天不会跳过内容；每天的计划在开始时固定下来，不会中途改变。

其他功能：
- 语块库：按功能分类浏览，显示学习进度，每条都有听力提示（连读、弱读）；
- AI 生成新母框；AI 解构任意句子；
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
