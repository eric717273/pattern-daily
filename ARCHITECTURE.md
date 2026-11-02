# 句型日练 · Pattern Daily — 架构与模块契约

把 Tim Ferriss「12 句解构法」和 Harold Palmer「替换表（母框）」+ 语块法结合起来的每日 15 分钟英语强化工具。
方法分析见 `research/METHODS.md`（第三节是 v2 设计依据），内容规范见 `research/CONTENT-GUIDE.md`。

**v2 的核心：两条互相独立的学习线。**
- **解码线**（Tim Ferriss）：13 个骨架句，前 13 天每天学 1 个（逐字对照、陷阱、变形练习），之后每天约 3 分钟维护（变形或成分标注），轮流复习 d01–d13。练的是理解，讲语法。
- **语块线**（Palmer + 语块研究）：150 个母框（f001–f150）+ 250 条固定表达（c001–c250），按交际功能（`FunctionCategory`）组织，不按语法。每天按课程表学 N 条新的（默认 5），其余靠 SRS 复习。练的是自动化，**不讲语法**。

## 平台
- **PWA**（Vite + React 19 + TypeScript + Tailwind v4 + vite-plugin-pwa）：iPhone 用 Safari 添加到主屏幕，Mac 用 Safari 添加到程序坞，体验接近原生 App。
- **本地优先**：所有数据存在 IndexedDB（Dexie），可完全离线使用。
- **双端联动**：可选接入 Supabase（邮箱验证码登录 + Postgres + RLS），用 last-write-wins 方式同步。
- **AI**：DeepSeek（兼容 OpenAI 的 `/chat/completions` 接口）。有两种接入方式：浏览器直连（Key 只保存在本机），或经 Supabase Edge Function `ai-proxy` 转发（Key 存在服务器端）。

## 目录
```
app/
  src/types.ts            共享类型（契约，由负责人维护）
  src/lib/db.ts           Dexie schema（契约，由负责人维护）
  src/content/            静态题库：dozen.ts（13 句 + 变形题）, frames-*.ts（150 个母框）, chunks-1..7.ts（350 条语块）, dialogues-1..3.ts（120 段对话）, sounds.ts（40 种音变）, index.ts
  src/lib/srs.ts          SM-2 间隔重复
  src/lib/frameEngine.ts  替换表组合引擎 + 答案比对
  src/lib/plan.ts         每日计划（解码线 + 语块线，纯函数）
  src/lib/curriculum.ts   语块线的学习顺序（纯函数）
  src/lib/repo.ts         所有读写 IndexedDB 的函数（写入时设置 updatedAt 和 _dirty=1）
  src/lib/settings.ts     本地设置（localStorage）
  src/lib/ai/             DeepSeek 客户端 + 提示词 + 结果校验
  src/lib/sync/           Supabase 客户端、认证、同步引擎
  src/lib/speech.ts       TTS / 语音识别
  src/pages/, src/components/  界面
supabase/
  migrations/0001_init.sql
  functions/ai-proxy/index.ts
```

## 模块接口（各模块必须按此实现，UI 只调用这些函数）

### content（`src/content/index.ts`）
```ts
export const DOZEN: DozenSentence[];               // 13 条，按 order 排序（每条 ≥5 个 transforms）
export const SEED_FRAMES: SubstitutionFrame[];     // frames-core + scenes + more + extra，共 150 个，都有 category/freq
export const CHUNKS: Chunk[];                      // CHUNKS_1..5 合并，按 id 排序，共 250 条
export const CURRICULUM: ItemRef[];                // buildCurriculum(SEED_FRAMES, CHUNKS)，语块线的学习顺序
export function getDozen(id: string): DozenSentence | undefined;
export function getChunk(id: string): Chunk | undefined;
export function getSeedFrame(id: string): SubstitutionFrame | undefined;
export function getItem(ref: ItemRef, userFrames?: readonly SubstitutionFrame[]):
  { kind: 'chunk'; chunk: Chunk } | { kind: 'frame'; frame: SubstitutionFrame } | undefined; // 母框先查内置，再查传入的用户母框
```
`content.test.ts` 校验：250 条语块（id 连续、例句原样包含语块、无重复）、≥150 母框、20 个功能类别各 ≥8 项、变形题字段与 `from` 来源、CURRICULUM 覆盖全部内容各一次。

### curriculum.ts
```ts
export function buildCurriculum(frames: SubstitutionFrame[], chunks: Chunk[]): ItemRef[];
```
确定性排序：先按 `freq`（1 → 2 → 3）分段；段内语块和母框各自按功能类别轮流取（相邻内容功能不同），再按约 3 个语块 : 2 个母框的节奏合并（母框先排 `level` 低的）。每项恰好出现一次。

### srs.ts
```ts
export function newCard(kind: CardKind, refId: string, now: number): CardState; // due = now
export function schedule(card: CardState, grade: Grade, now: number): CardState; // SM-2，返回新对象
export function isDue(card: CardState, now: number): boolean;
```

### frameEngine.ts
```ts
export function countCombos(f: SubstitutionFrame): number;
export function buildCombo(f: SubstitutionFrame, picks: Record<string, number>): FrameCombo;
export function randomCombo(f: SubstitutionFrame, rng?: () => number): FrameCombo;
/** 连续若干句，每一句只比上一句换一个槽位（帕默第 2 步：单槽快替） */
export function singleSwapSequence(f: SubstitutionFrame, length: number, rng?: () => number): FrameCombo[];
export function normalizeEn(s: string): string;   // 小写、统一缩写（I'm = I am）、去掉标点和多余空格
export function compareAnswer(user: string, target: string): {
  exact: boolean; similarity: number; // 0..1，按 token 计算的 LCS
  tokens: { text: string; status: 'ok' | 'missing' | 'extra' }[];
};
```

### plan.ts
```ts
export function todayStr(now?: Date): string;                      // 本地时区 'YYYY-MM-DD'
export function dayIndexFor(startDate: string, today: string): number; // 从 1 开始，仅作日历换算
export function getDayPlan(i: {
  dayIndex: number;
  introduced: ReadonlySet<string>;   // 'chunk:c001' | 'frame:f001'，即卡片 id
  curriculum: readonly ItemRef[];
  newPerDay: number;                 // 限制在 3–10
}): DayPlan;                         // 纯函数
export function itemKey(ref: ItemRef): string;
```
课序规则：「第 N 课」按**已完成的课数**推进，不按日历天数（`repo.getTodayDayIndex`），所以漏练的日子不会跳过内容。
- 解码线：第 1–13 天 `{ phase: 'foundation', dozenId: d<dayIndex> }`；第 14 天起 `{ phase: 'maintenance', dozenId, mode }`，`dozenId` 按 `(dayIndex-14) % 13` 轮转 d01–d13，`mode` 逐日交替 `transform`（偶数偏移，第 14 天）/ `label`。
- 语块线：`newItems` = 课程表里前 `newPerDay` 个**尚未引入**的条目（母框不再按解构句的语法挑选）；库学完后返回更少（只剩复习和解码）。没有完成的一天不会推进课程表，因为条目只在学完后才被引入。
- `outputCount` = 3。

### repo.ts
```ts
export const localChanges: EventTarget;  // 每次本地写入后派发 'change' 事件
export function getOrCreateProfile(): Promise<Profile>;
export function updateProfile(patch: Partial<Profile>): Promise<Profile>;
export function ensureCards(kind: CardKind, refIds: string[]): Promise<void>;
export function introduceItems(refs: ItemRef[]): Promise<void>;   // 学完新条目后调用：为语块/母框建 SRS 卡片（即「已引入」）
export function getDueCards(now: number, limit: number, kinds?: CardKind[]): Promise<CardState[]>; // 复习步骤用 ['chunk','frame']
export function gradeCard(cardId: string, grade: Grade, mode: DrillMode, durationMs: number): Promise<CardState>;
export function getOrCreateSession(date: string): Promise<DailySession>;   // 新建时 dayIndex = getTodayDayIndex(date)，并冻结 plan
export function getTodayDayIndex(today: string): Promise<number>;
export function markStepDone(date: string, step: StepKey, activeMs: number): Promise<DailySession>;
export function saveAttempt(a: Omit<Attempt, 'id' | 'updatedAt' | 'createdAt'>): Promise<Attempt>;
export function listAttempts(refId?: string, limit?: number): Promise<Attempt[]>;
export function saveUserFrame(f: SubstitutionFrame): Promise<UserFrame>;
export function listUserFrames(): Promise<SubstitutionFrame[]>;
export function deleteUserFrame(id: string): Promise<void>;
export function getAllFrames(): Promise<SubstitutionFrame[]>;     // 内置母框 + 未删除的用户母框
export function getLibraryProgress(): Promise<{                  // 内置母框 + 语块
  total: number; introduced: number; mastered: number;           // introduced = 有卡片；mastered = 间隔 ≥ 21 天
  byCategory: Record<FunctionCategory, { total: number; introduced: number; mastered: number }>;
}>;
export function getStats(now?: number): Promise<{
  streak: number; totalDays: number; totalReviews: number; cardsLearned: number;
  minutesLast7: number; heatmap: { date: string; minutes: number }[]; // 最近 84 天
}>;
export function exportData(): Promise<string>;   // JSON 备份
export function importData(json: string): Promise<void>;
```
每日会话与冻结的计划：新建 `DailySession` 时，repo 立即算出今天的 `DayPlan`（introduced = 所有未删除的 chunk/frame 卡片，curriculum = `CURRICULUM`，newPerDay = `profile.newPerDay ?? 5`）并存进 `session.plan`，之后当天不再重排，换设备同步后也一致。没有 `plan` 的旧会话在第一次读取时补算并标脏。`markStepDone` 只认 v2 四步 `review | chunks | decode | output`，全部完成才写 `completedAt`，旧步骤键被忽略。

写入规则：所有同步表的写入一律经过 repo，写入时 `updatedAt = Date.now()`、`_dirty = 1`。删除采用软删除（`deleted: true`），读取时过滤掉。

### labels.ts（中文标签）
`FUNCTION_CATEGORY_LABELS` / `FUNCTION_CATEGORIES`（20 个功能类别）、`FREQ_LABELS`（1 最高频 / 2 常用 / 3 进阶）、`TRANSFORM_OP_LABELS` / `TRANSFORM_OPS`，以及原有的语法点、场景、槽位角色标签。

### settings.ts
```ts
export const DEFAULT_SETTINGS: Settings;
export function getSettings(): Settings;
export function saveSettings(patch: Partial<Settings>): Settings; // 写入后派发 window 'settings-change' 事件
export function useSettings(): [Settings, (patch: Partial<Settings>) => void];
```

### ai（`src/lib/ai/index.ts`）
```ts
export class AiError extends Error { code: 'no-key'|'network'|'cors'|'auth'|'rate'|'bad-response'|'proxy-unavailable' }
export function aiConfigured(s?: Settings): boolean;
export function gradeOutput(i: { promptZh?: string; skeletonEn?: string; grammar?: GrammarPoint[]; targetChunk?: string; userEn: string }): Promise<AiFeedback>;
// 语块线批改传 targetChunk（要用的语块/母框），只评「用得是否自然」，不做语法分析；不传则沿用解码线的语法批改
export interface Deconstruction { en: string; zh: string; skeleton: string; alignment: AlignmentToken[];
  grammar: GrammarPoint[]; nearestDozenId: string; explanationZh: string; frame?: SubstitutionFrame }
export function deconstruct(sentenceEn: string): Promise<Deconstruction>;   // 视频 AI 指令 1：看清骨架
export function generateFrame(i: { topic: string; scene: Scene; level: 1|2|3; grammar?: GrammarPoint[] }): Promise<SubstitutionFrame>;
export function generateOutputPrompts(i: { dozen: DozenSentence; frames: SubstitutionFrame[]; scenes: Scene[]; count: number }):
  Promise<{ promptZh: string; hintEn: string }[]>;                           // 视频 AI 指令 2：每天 3 句模组替换（解码线）
export function generateChunkPrompts(i: { items: Array<{ kind: 'chunk'; chunk: Chunk } | { kind: 'frame'; frame: SubstitutionFrame }>; scenes: Scene[]; count: number }):
  Promise<{ promptZh: string; hintEn: string; targetId: string }[]>;         // 语块线输出题：真实中文情景，每题针对一个目标，hint 只给关键词；targetId 必须属于 items
export function testConnection(): Promise<void>;
```
所有 AI 输出都要求 JSON 格式（`response_format: {type: 'json_object'}`），并在运行时校验；校验不通过时抛出 `bad-response`。

### sync（`src/lib/sync/index.ts`）
```ts
export function syncConfigured(): boolean;
export function sendOtp(email: string): Promise<void>;
export function verifyOtp(email: string, code: string): Promise<void>;
export function signOut(): Promise<void>;
export function currentUserEmail(): Promise<string | null>;
export function syncNow(): Promise<{ pushed: number; pulled: number }>;
export function startAutoSync(): () => void;  // 本地变更后防抖 3 秒、回到前台、恢复联网、每 60 秒都会触发同步；返回停止函数
export function useSyncStatus(): { state: 'off'|'signed-out'|'idle'|'syncing'|'error'|'offline'; lastSyncedAt?: number; error?: string };
```
服务端表 `records(user_id, tbl, id, data jsonb, updated_at bigint, deleted bool, server_ts timestamptz)`，主键为 (user_id, tbl, id)，开启 RLS（`user_id = auth.uid()`）。
- 推送：upsert 所有 `_dirty=1` 的行，但服务端只接受 `updated_at` 更新的那一方。
- 拉取：读取 `server_ts > cursor` 的行，本地按 LWW 合并。

### speech.ts
```ts
export function speak(text: string, opts?: { rate?: number }): Promise<void>;
export function stopSpeaking(): void;
export function recognitionSupported(): boolean;
export function listenOnce(lang?: string): Promise<string>;  // webkitSpeechRecognition
```

## v3 刻意练习（设计依据见 `research/DELIBERATE-PRACTICE.md`）

在 v2 两条线之上增加「测量 → 控制器 → 冻结计划」的闭环。没有设置目标（`profile.goal`）时，一切保持 v2 行为（4 个步骤、无 v3 字段）。

**内容**：`CHUNKS` 扩到 350 条（c251–c300 打 `phrasal`，c301–c350 打 `collocation`），资料库共 500 条（150 母框 + 350 语块）；`DIALOGUES`（dl001–dl120，3 档）、`SOUNDS`（s01–s40）、`getDialogue`、`getSound`。

**纯逻辑模块（`src/lib/`，均有单测）**
| 模块 | 职责 |
|---|---|
| `ladder.ts` | 难度阶梯表：`LISTEN_LEVELS`（L0–L8：tier + 语速）、`SPEAK_LIMITS_MS`（S0–S5：10/8/6/5/4/3 秒）；`listenRate`、`dialogueTier`、`speakLimitMs`、`defaultLadder`（L1 / S1 / 每天 5 条） |
| `skills.ts` | `computeSkillStats(logs, now)`：每项技能取最近 40 条带 `skill`+`correct` 的 ReviewLog，算正确率、答对反应时间中位数、趋势（最近 20 对前 20）、各等级分布；另有各功能类别正确率、最弱类别、音变错误次数 |
| `adaptive.ts` | 控制器 `adjust(state, stats, today, ctx)`：滚动正确率 > 0.88 升一级、< 0.70 降一级；样本 < 15 不动；同一维度两次调整间隔 ≥ 2 天；新语块数按时间预算估算（限 3–12），任一技能 < 0.65 再减 2；每次调整都带中文原因。`findEdgeItems` 找边缘语块（14 天内遗忘 / 最近 3 次对错混杂 / 答对但用时 ≥ 时限 80%） |
| `assessment.ts` | 诊断与周复测的**选题与评分**：`buildPlacement`、`nextListenLevel`、`scorePlacement`、`buildCheckpoint`、`scoreCheckpoint`（界面只负责展示和收集结果） |
| `goalPlan.ts` | `buildGoalPlan`：打基础 / 扩展 / 提速三阶段（30% / 70% / 100%）及里程碑；`progressStatus`：超前 / 按计划 / 落后 + 中文建议 |
| `numbers.ts` | 数字听写：`makeNumberItem(kind, rng)` 生成价格、时间、日期、电话、数量、年份（`spoken` 给 TTS，`answer`/`accept` 为书写答案）；`checkNumberAnswer` 宽松比对 |
| `plan.ts`（v3 部分） | `getDayPlanV3`：在 v2 计划上加阶梯快照、`budgetMin`（25/25/25/10/15%，合计等于每日分钟）、`listening`（对话 / 音变 / 数字）、`edge`（≤ 5）、`checkpointDue`；`requiredSteps`：v3 计划 5 步，v2 计划 4 步 |
| `coachInput.ts` | `buildCoachInput`：把统计、阶梯、边缘语块文本、进度整理成 AI 教练的聚合输入（不含用户原句） |
| `ai/coach.ts` | `generateCoachReport(input)`（DeepSeek，校验后返回 `CoachReport`）和离线兜底 `rulesCoachReport(input)` |

**数据流**
```
练习作答 ──gradeCard(…, measurement) / logMeasurement──▶ ReviewLog（skill, correct, latencyMs, level；伪 id 如 dialogue:dl001、numbers:price）
        ──▶ computeSkillStats ──▶ adaptive.adjust ──▶ profile.adaptive（阶梯 + lastChange + history）
        ──▶ 次日 getOrCreateSession 冻结 DayPlan（ladder 快照、budgetMin、listening、edge、checkpointDue）
诊断 / 周复测 ──scorePlacement / scoreCheckpoint──▶ saveAssessment ──▶ profile.assessments（诊断同时设定起始阶梯，快速通道语块以 7 天首次间隔入库）
每 7 课 / 手动 ──getCoachInput──▶ generateCoachReport | rulesCoachReport ──saveCoachReport──▶ profile.coachReports（保留 12 份）
```
- 写 ReviewLog 的可选字段，不新增同步表，服务端无需迁移。`logMeasurement` 只写日志，不动 SRS；`gradeCard` 的第 5 个可选参数同时调度并记录测量。
- `runAdaptation(today)` 在一天完成后调用（幂等），返回当天的调整（"明天的调整"）；`getDaySummaryV3(date)` 返回今日反馈（各技能正确率与 70–88% 区间、反应时间、错题、当天调整）。
- `getGoalProgress()` 返回阶段计划与进度状态；`setGoal` 与诊断保存后，若今天还没开始，会丢弃旧的冻结计划以便按新目标重建。
- 控制器和水平描述是启发式方法，不是经过验证的测评工具（详见规范第九节）。

## 质量要求
- 使用 TypeScript strict 模式，禁用 `any`（外部 JSON 用 `unknown` 加校验）。
- 纯逻辑模块（srs、frameEngine、plan、repo、ai 解析、同步合并）都要有 Vitest 单测；IndexedDB 测试用 `fake-indexeddb`。
- 界面移动端优先：适配 iPhone 安全区，宽屏时变为侧边栏布局，支持深色模式，界面文字为简体中文。
