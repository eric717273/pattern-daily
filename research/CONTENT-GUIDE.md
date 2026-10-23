# 语块库内容规范（v2）

目标：约 400 条可以自动化的高频语块，其中 150 个**可替换母框**（Palmer 替换表）和 250 条**固定表达**（整块记忆）。
内容按**交际功能**组织，不按语法组织。学习者是中文母语者，目标是让这些句子脱口而出、听到就懂，所以在语块线上不讲语法。

## 1. 选材原则
- **真实高频**：选母语者在日常对话、职场、出行中**真的每天会说、会听到**的表达，不选教科书腔、过时或生硬的说法（例如不收 "How do you do?"、"I'm fine, thank you, and you?"）。可以参考 PHRASE List、口语语料库里的高频多词表达，以及影视对白中的高频说法，但内容必须自己写，不要照抄任何付费教材。
- **以美式中性英语为主**，英美都通用的优先。register 要如实标注：casual 用于朋友之间，neutral 任何场合都可以，formal 用于正式场合或邮件。
- **freq 如实标注**：1 = 几乎每天都会听到或用到（如 "Let me think."、"That makes sense."），2 = 常用，3 = 进阶。每个人写的内容里，freq=1 约占 40%，2 约占 40%，3 约占 20%。
- **整块性**：一条固定表达是一个**整体可调用**的单位，长度 2–8 个词。可以是完整句（"It's up to you."），也可以是句首框架（"I was wondering if …"，用 … 表示后面接内容）。
- **不重复**：只写分配给你的 category。同一意思只保留最常用的一两种说法；近义但用法不同的可以都收，但要在 noteZh 里说明区别。

## 2. 固定表达（Chunk）字段要求
- `en`：语块本身。完整句要带句末标点，开放式框架以 " …" 结尾。
- `zh`：自然的简体中文对应说法，要译出功能，不要逐字直译（例如 "I'm all ears." 译为"你说，我听着呢。"）。
- `examples`：2 条，都是真实场景里会出现的一句话或一问一答（A: … B: …）。**en 里必须原样包含该语块**（忽略大小写、句末标点和 …）。zh 是整句自然翻译。
- `noteZh`：一句话说明什么时候用、语气如何、容易用错的地方（30–60 字）。
- `soundZh`：**听力提示**，凡是有明显连读、弱读、吞音的都要写，帮助学习者在听力中整块捕捉。例如 "want to → wanna；let me → lemme"、"What are you → Whatcha"、"kind of → kinda"、"Did you → didja"。没有明显音变的可以省略。

## 3. 可替换母框（SubstitutionFrame）补充要求
- 沿用已有母框的全部规则：**任意组合都必须地道自然**，pattern 和 patternZh 的占位符一致，每个槽位 3–6 个选项。
- 新增字段：`category`（交际功能）、`freq`，以及可选的 `soundZh`（固定部分的音变，例如 "Would you mind → Wouldja mind"）。
- `grammar` 只标确实练到的语法点，可以为空数组。

## 4. 分类与 ID 分配
| 负责人 | category | 固定表达 ID |
|---|---|---|
| C1 | greeting, response, filler, connector | c001–c050（文件 chunks-1.ts，导出 CHUNKS_1） |
| C2 | opinion, agree, clarify, question | c051–c100（chunks-2.ts / CHUNKS_2） |
| C3 | request, offer, thanks, advice | c101–c150（chunks-3.ts / CHUNKS_3） |
| C4 | feeling, describe, experience, plan | c151–c200（chunks-4.ts / CHUNKS_4） |
| C5 | problem, work, travel, social | c201–c250（chunks-5.ts / CHUNKS_5） |
| C6 | 为 f001–f100 补 category/freq；新增 f101–f150（frames-extra.ts / FRAMES_EXTRA） | — |

每人负责 4 个类别，每类 12–13 条，类别之间大致均衡。

## 5. 自检
- 用临时脚本（放在 scratchpad，不放进仓库）检查以下几点：ID 连续且唯一，类别属于自己负责的范围，examples 原样包含语块，没有重复的 en，字段齐全。
- 逐条朗读一遍：这是母语者会说的话吗？中文自然吗？例句真实吗？
