import { useState } from 'react';
import type { AdaptiveChange, AdaptiveState, CoachReport, Profile } from '../../types';
import { AiError, aiConfigured, generateCoachReport, rulesCoachReport } from '../../lib/ai';
import { defaultAdaptiveState, HISTORY_LIMIT } from '../../lib/adaptive';
import { clampNewPerDayV3, defaultLadder } from '../../lib/ladder';
import { todayStr } from '../../lib/plan';
import { getCoachInput, getOrCreateProfile, saveCoachReport, updateProfile } from '../../lib/repo';
import { Badge, Button } from '../ui';

function ReportList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h4 className="mb-1 text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</h4>
      <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-slate-700 dark:text-slate-200">
        {items.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

function ReportBody({ r }: { r: CoachReport }) {
  return (
    <div className="flex flex-col gap-3.5">
      <p className="text-[15px] leading-relaxed text-slate-800 dark:text-slate-100" data-testid="coach-summary">
        {r.summaryZh}
      </p>
      <ReportList title="做得好的地方" items={r.strengthsZh} />
      <ReportList title="需要加强" items={r.weaknessesZh} />
      <ReportList title="下周重点" items={r.nextWeekFocusZh} />
      <ReportList title="练习建议" items={r.tipsZh} />
    </div>
  );
}

function reportDate(r: CoachReport): string {
  return todayStr(new Date(r.createdAt));
}

/** Newest report in full + "生成本周报告"; older reports are collapsed. */
export function CoachSection({ profile }: { profile: Profile }) {
  const reports = [...(profile.coachReports ?? [])].reverse();
  const latest = reports[0];
  const older = reports.slice(1);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adopted, setAdopted] = useState<number | null>(null);

  const generate = async () => {
    setBusy(true);
    setNotice(null);
    setError(null);
    setAdopted(null);
    try {
      const input = await getCoachInput();
      let report: CoachReport;
      if (aiConfigured()) {
        try {
          report = await generateCoachReport(input);
        } catch (e) {
          if (!(e instanceof AiError)) throw e;
          report = rulesCoachReport(input);
          setNotice(`AI 教练暂时不可用（${e.message}），已用规则生成简版周报。`);
        }
      } else {
        report = rulesCoachReport(input);
        setNotice('还没有配置 AI，已用规则生成简版周报。在“我的”里填写 DeepSeek 密钥后可以得到更详细的报告。');
      }
      await saveCoachReport(report);
    } catch (e) {
      setError(e instanceof Error ? e.message : '生成失败，请稍后再试。');
    } finally {
      setBusy(false);
    }
  };

  const adopt = async (n: number) => {
    setError(null);
    try {
      const current = await getOrCreateProfile();
      const base: AdaptiveState = current.adaptive ?? defaultAdaptiveState({ ...defaultLadder(), newPerDay: clampNewPerDayV3(current.newPerDay ?? 5) });
      const to = clampNewPerDayV3(n);
      const from = base.ladder.newPerDay;
      if (to !== from) {
        const today = todayStr();
        const change: AdaptiveChange = { date: today, dimension: 'newPerDay', from, to, reasonZh: `采纳 AI 教练建议，新语块从每天 ${from} 条改为 ${to} 条` };
        await updateProfile({
          newPerDay: to,
          adaptive: {
            ...base,
            ladder: { ...base.ladder, newPerDay: to },
            lastChange: { ...base.lastChange, newPerDay: today },
            history: [...base.history, change].slice(-HISTORY_LIMIT),
          },
        });
      }
      setAdopted(to);
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败，请稍后再试。');
    }
  };

  const suggested = latest?.suggestedNewPerDay;
  const currentNew = profile.adaptive?.ladder.newPerDay ?? profile.newPerDay;
  const canAdopt = suggested !== undefined && suggested !== currentNew;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" onClick={() => void generate()} disabled={busy}>
          {busy ? '正在生成…' : '生成本周报告'}
        </Button>
        <p className="text-xs text-slate-400 dark:text-slate-500">只发送统计数据和语块文本，不发送你写的句子。</p>
      </div>
      {notice && (
        <p role="status" className="rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200" data-testid="coach-notice">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
          {error}
        </p>
      )}

      {!latest ? (
        <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400" data-testid="coach-empty">
          还没有周报。练习几天后点“生成本周报告”，教练会根据你的正确率、薄弱环节和计划进度给出具体建议。
        </p>
      ) : (
        <article aria-label="最新周报" className="flex flex-col gap-3.5" data-testid="coach-latest">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Badge tone={latest.source === 'ai' ? 'violet' : 'slate'}>{latest.source === 'ai' ? 'AI 教练' : '规则简版'}</Badge>
            <span className="tabular-nums">
              {reportDate(latest)} · 第 {latest.lesson} 课
            </span>
          </div>
          <ReportBody r={latest} />
          {suggested !== undefined && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl bg-indigo-50 px-3.5 py-3 text-sm text-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-100">
              <span className="min-w-0 flex-1">
                教练建议每天新语块 <strong>{suggested}</strong> 条（现在 {adopted ?? currentNew} 条）。
              </span>
              {canAdopt && adopted === null && (
                <Button size="sm" variant="primary" onClick={() => void adopt(suggested)}>
                  采纳建议
                </Button>
              )}
              {adopted !== null && <span className="font-medium">已采纳，从下一课开始生效。</span>}
            </div>
          )}
        </article>
      )}

      {older.length > 0 && (
        <div className="flex flex-col gap-2" aria-label="往期周报">
          {older.map((r) => (
            <details key={r.id} className="rounded-xl border border-slate-200 px-3.5 py-2 dark:border-slate-800" data-testid="coach-older">
              <summary className="min-h-9 cursor-pointer py-1 text-sm font-medium text-slate-700 dark:text-slate-200">
                {reportDate(r)} · 第 {r.lesson} 课 · {r.source === 'ai' ? 'AI 教练' : '规则简版'}
              </summary>
              <div className="pt-2 pb-2">
                <ReportBody r={r} />
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
