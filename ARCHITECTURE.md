# 句型日练 · Pattern Daily — 架构与模块契约

把 Tim Ferriss「12 句解构法」和 Harold Palmer「替换表（母框）」结合起来的每日 15 分钟英语强化工具。
方法分析见 `research/METHODS.md`。

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
  src/content/            静态题库：dozen.ts, frames-core.ts, frames-scenes.ts, index.ts
  src/lib/srs.ts          SM-2 间隔重复
  src/lib/frameEngine.ts  替换表组合引擎 + 答案比对
  src/lib/plan.ts         30 天计划
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
export const DOZEN: DozenSentence[];              // 13 条，按 order 排序
export const SEED_FRAMES: SubstitutionFrame[];    // frames-core + frames-scenes
export function getDozen(id: string): DozenSentence | undefined;
```

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
export function dayIndexFor(startDate: string, today: string): number; // 从 1 开始
export function getDayPlan(dayIndex: number, frames: SubstitutionFrame[]): DayPlan;
```
计划规则：第 1–13 天每天学 1 个新的解构句（按 order），母框取与该句 grammar 有交集、尚未出现过的 2 个。第 14–30 天每天 3 个母框，按 level 递进、场景轮换，dozenId 轮流复习。31 天以后进入维护期，确定性地轮换。

### repo.ts
```ts
export const localChanges: EventTarget;  // 每次本地写入后派发 'change' 事件
export function getOrCreateProfile(): Promise<Profile>;
export function updateProfile(patch: Partial<Profile>): Promise<Profile>;
export function ensureCards(kind: CardKind, refIds: string[]): Promise<void>;
export function getDueCards(now: number, limit: number): Promise<CardState[]>;
export function gradeCard(cardId: string, grade: Grade, mode: DrillMode, durationMs: number): Promise<CardState>;
export function getOrCreateSession(date: string): Promise<DailySession>;
export function markStepDone(date: string, step: StepKey, activeMs: number): Promise<DailySession>;
export function saveAttempt(a: Omit<Attempt, 'id' | 'updatedAt' | 'createdAt'>): Promise<Attempt>;
export function listAttempts(refId?: string, limit?: number): Promise<Attempt[]>;
export function saveUserFrame(f: SubstitutionFrame): Promise<UserFrame>;
export function listUserFrames(): Promise<SubstitutionFrame[]>;
export function deleteUserFrame(id: string): Promise<void>;
export function getAllFrames(): Promise<SubstitutionFrame[]>;     // 内置母框 + 未删除的用户母框
export function getStats(now?: number): Promise<{
  streak: number; totalDays: number; totalReviews: number; cardsLearned: number;
  minutesLast7: number; heatmap: { date: string; minutes: number }[]; // 最近 84 天
}>;
export function exportData(): Promise<string>;   // JSON 备份
export function importData(json: string): Promise<void>;
```
写入规则：所有同步表的写入一律经过 repo，写入时 `updatedAt = Date.now()`、`_dirty = 1`。删除采用软删除（`deleted: true`），读取时过滤掉。

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
export function gradeOutput(i: { promptZh?: string; skeletonEn?: string; grammar: GrammarPoint[]; userEn: string }): Promise<AiFeedback>;
export interface Deconstruction { en: string; zh: string; skeleton: string; alignment: AlignmentToken[];
  grammar: GrammarPoint[]; nearestDozenId: string; explanationZh: string; frame?: SubstitutionFrame }
export function deconstruct(sentenceEn: string): Promise<Deconstruction>;   // 视频 AI 指令 1：看清骨架
export function generateFrame(i: { topic: string; scene: Scene; level: 1|2|3; grammar?: GrammarPoint[] }): Promise<SubstitutionFrame>;
export function generateOutputPrompts(i: { dozen: DozenSentence; frames: SubstitutionFrame[]; scenes: Scene[]; count: number }):
  Promise<{ promptZh: string; hintEn: string }[]>;                           // 视频 AI 指令 2：每天 3 句模组替换
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

## 质量要求
- 使用 TypeScript strict 模式，禁用 `any`（外部 JSON 用 `unknown` 加校验）。
- 纯逻辑模块（srs、frameEngine、plan、repo、ai 解析、同步合并）都要有 Vitest 单测；IndexedDB 测试用 `fake-indexeddb`。
- 界面移动端优先：适配 iPhone 安全区，宽屏时变为侧边栏布局，支持深色模式，界面文字为简体中文。
