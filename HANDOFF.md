# 交接文档：把句型日练并入原生 Study App（iPhone + Mac）

本文档写给接手开发的人或 AI（例如本地的 Claude Code），用来把本项目的学习法、内容和算法移植到原生 SwiftUI App 中。
现有 PWA（`app/`）功能完整、测试齐全，可以作为**参考实现**，移植时逐个模块对照。

## 1. 为什么改用原生
| 问题 | PWA（Safari） | 原生 App |
|---|---|---|
| 语音合成 | 只能用 Apple 开放给网页的部分声音，音质不如系统设置里试听的 | `AVSpeechSynthesizer` 可调用全部已下载的高级、增强语音；可申请使用 Personal Voice（Siri 声音第三方仍不可用） |
| 语音识别 | Safari 的 Web Speech 不稳定，依赖"听写"开关，会出现卡住、结果丢失 | `SFSpeechRecognizer` + `requiresOnDeviceRecognition`，稳定，可拿到逐词时间戳 |
| 局域网服务 | 浏览器受 HTTPS 和混合内容限制 | 可直接访问局域网 HTTP 服务（需配置 ATS 例外或使用本地证书） |
| 数据 | IndexedDB，加 Supabase 同步 | SwiftData + CloudKit 原生同步 |

## 2. 必读文件（按顺序）
1. `research/METHODS.md`：两套方法（Ferriss 解构、Palmer 替换表）以及"两条独立学习线"的理由。
2. `research/DELIBERATE-PRACTICE.md`：刻意练习设计。包括四要素、测量、难度阶梯 L0–L8 和 S0–S5、控制器规则、诊断测试、计划生成、每日 5 块流程、AI 教练。**这是核心规格。**
3. `research/CONTENT-GUIDE.md`：语料编写规范，扩充内容时使用。
4. `ARCHITECTURE.md`：PWA 的模块划分与数据流。
5. `app/src/types.ts`：**全部数据结构的权威定义**。JSON 内容和用户数据都以它为准。

## 3. 内容（可直接导入）
`export/content/` 下的 JSON 由 `export/export-content.ts` 生成，修改内容后重新运行：
`npx -y tsx export/export-content.ts`

| 文件 | 数量 | 类型（见 types.ts） | 所属学习线 |
|---|---|---|---|
| `dozen.json` | 13 | `DozenSentence`（含逐字对照、文法陷阱、变形练习 `transforms`） | 解码线 |
| `frames.json` | 150 | `SubstitutionFrame`（Palmer 替换表母框，任意组合都合法） | 语块线 |
| `chunks.json` | 350 | `Chunk`（固定表达；c251–c350 带 `phrasal`/`collocation` 标签） | 语块线 |
| `dialogues.json` | 120 | `Dialogue`（双人对话，含主旨题和听写空，tier 1–3） | 听力 |
| `sounds.json` | 40 | `SoundPattern`（连读、弱读、吞音，带 heard 拼读） | 听力 |
| `curriculum.json` | 500 | `ItemRef[]`（语块线的学习顺序） | 语块线 |

数字听写不需要内容文件，由 `app/src/lib/numbers.ts` 按规则生成，需要移植这段逻辑。

## 4. 需要移植的算法（参考实现 → 测试）
每个模块都有 Vitest 单测，可以把测试用例翻译成 XCTest，作为验收标准。

| 模块 | 参考实现 | 要点 |
|---|---|---|
| 间隔重复 | `lib/srs.ts` | SM-2 变体，评分 0–3（忘了/困难/良好/简单），ease 最小 1.3；首次 1 天、第二次 3 天，之后 × ease；`knownCard` 用于诊断时快速通道的语块 |
| 替换表引擎 | `lib/frameEngine.ts` | 按槽位组合句子（中英双语）、单槽快替序列、`normalizeEn`（展开缩写）、`compareAnswer`（逐词 LCS 比对） |
| 语音判定 | `lib/voiceMatch.ts` | 识别文本与目标的相似度不低于 0.85，**且**被替换的词块必须说对；忽略 uh、um 等口头语，数字转成单词 |
| 课程与计划 | `lib/curriculum.ts`、`lib/plan.ts` | 按频率等级、类别轮换排序，语块与母框约 3:2 交替；当天计划在开始时冻结；课号按完成的课数推进，漏练不跳课 |
| 难度阶梯 | `lib/ladder.ts` | L0–L8 对应（对话难度 tier, 语速 rate），S0–S5 对应说出时限 10、8、6、5、4、3 秒 |
| 技能统计 | `lib/skills.ts` | 每项技能取最近 40 次测量：正确率、正确题反应时间中位数（**只用语音识别验证过的反应时间**）、趋势 |
| 控制器 | `lib/adaptive.ts` | 目标区间 70%–88%；每次只调一级；同一维度两次调整之间至少隔 2 天；至少 15 个样本才调整；新语块数按时间预算推算（3–12 条）；边缘语块的判定规则 |
| 诊断与复测 | `lib/assessment.ts` | 听力阶梯测试从 L2 开始；口语按验证过的反应时间定级，自评模式下只按正确率保守定级，且不触发快速通道 |
| 阶段计划 | `lib/goalPlan.ts` | 三阶段（30% / 40% / 30%）、里程碑、超前、按计划或落后的判断 |
| 时间预算 | `lib/plan.ts` `splitBudget` | 5 块按 25 / 25 / 25 / 10 / 15 % 分配 |
| AI | `lib/ai/*` | DeepSeek（兼容 OpenAI 接口），返回 JSON 并做校验；提示词在 `prompts.ts`；教练周报只发送聚合统计数据 |

数据层：`lib/repo.ts` 是所有读写的入口。测量数据写在 `ReviewLog` 的 `skill`、`correct`、`latencyMs`、`level` 字段中。没有对应卡片的练习（对话、数字等）使用伪 id，如 `dialogue:dl001`、`numbers:price`。

## 5. 原生实现建议
- **语音合成**：
  - 用 `AVSpeechSynthesizer`；`AVSpeechSynthesisVoice.speechVoices()` 中优先选 `quality == .premium`，其次 `.enhanced`。
  - 对话选一男一女两个声音。语速对应 L 等级：`rate` 用 `AVSpeechUtteranceDefaultSpeechRate × 等级倍率` 换算，需要实测校准。
  - 可选：`AVSpeechSynthesizer.requestPersonalVoiceAuthorization`。
- **语音识别**：
  - 用 `SFSpeechRecognizer(locale: en-US)`，设置 `requiresOnDeviceRecognition = true`、`shouldReportPartialResults = true`。
  - 用部分结果做实时判定，配合 `voiceMatch` 的规则。
  - 反应时间从提示出现开始计算，到判定通过为止。
  - 播放语音合成时暂停识别，避免把自己的声音当成回声。
- **数据**：
  - SwiftData 模型按 types.ts 一一对应：`CardState`、`ReviewLog`、`DailySession`、`Profile`（含 goal、adaptive、assessments、coachReports）、`Attempt`、`UserFrame`。
  - 用 CloudKit 同步 iPhone 和 Mac，可以取代 Supabase。
- **与 Study App 合并**：
  - 把"今日（五块）/ 语块库 / 计划 / 解码"作为 Study 里的一个模块或标签页。
  - 用户数据结构保持独立，便于以后和 Study 的其他学习记录统一统计。
- **迁移旧数据**：PWA 的"我的 → 数据备份 → 导出 JSON"会导出 cards、reviews、sessions、profile 等数据（格式见 `repo.exportData`），原生 App 可以提供导入功能。

## 6. 局域网服务器（可选）
建议提供一个简单的 HTTP 服务，App 在局域网内优先调用，失败时回退到本机能力：

| 接口 | 作用 | 可选模型 |
|---|---|---|
| `POST /tts`：`{ text, voice, rate, style? }` 返回音频（mp3/wav） | 高质量神经语音，可带情感 | Kokoro、Piper（轻量）、F5-TTS、XTTS v2（可克隆音色、带情感） |
| `POST /stt`：音频 → `{ text, words[{w,start,end}] }` | 更准的识别，用于发音评估 | Whisper（faster-whisper / whisper.cpp） |
| `POST /chat`：转发给大模型 | 本地模型代替 DeepSeek（可选） | Ollama 上运行的 Qwen 等模型 |

- **缓存**：固定内容（语块、对话等约 2000 句）可以在服务器上**预先批量生成音频**，App 同步到本机缓存，离线也能用高质量语音。
- **外出访问**：在家用局域网地址；在外可以用 Tailscale 组网访问服务器，否则回退到 `AVSpeechSynthesizer`。

## 7. 已知问题与待验证事项
- 语料由 AI 编写，经过查重和抽检，没有逐条人工审过；频率等级来自经验判断。
- 控制器参数（70%–88%、15 个样本、隔 2 天）是启发式设定，需要用真实使用数据校准。
- 每天 15–20 分钟时，按时间预算推算，每天新语块常稳定在 3–5 条；如果希望更多，可以调整预算比例。
- 自评模式下的反应时间不能当作口语测量，这是已修复过的问题，移植时注意保持。

## 8. PWA 的现状
- 线上地址：https://eric717273.github.io/pattern-daily/ 。推送到 `main` 分支后会自动部署。
- 测试：`cd app && npm test`（962 个单元测试）、`npm run e2e`（36 个端到端测试）。
- 原生 App 完成之前，PWA 可以继续使用，两者之间用 JSON 导出、导入的方式迁移数据。
