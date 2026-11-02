import { Button, Card, Chip, Field, Segmented } from '../../components/ui';

export const HORIZONS = [30, 60, 100] as const;
export const MINUTES = [15, 20, 25, 30] as const;
export const RECOMMENDED_HORIZON = 100;
export const RECOMMENDED_MINUTES = 20;

export interface GoalDraft {
  horizonDays: 30 | 60 | 100;
  dailyMinutes: number;
}

const ELEMENTS = [
  { name: '明确的目标', body: '先定下周期和每天的时间，计划会拆成可衡量的阶段目标。' },
  { name: '专注', body: '每天切成几个 3–8 分钟的短块，一次只做一件事。' },
  { name: '即时反馈', body: '每题马上知道对错和用时，每周还有一份教练报告。' },
  { name: '走出舒适区', body: '系统把正确率保持在 70%–88%：不太容易，也不太难。' },
] as const;

export interface GoalStepProps {
  draft: GoalDraft;
  onChange: (d: GoalDraft) => void;
  onNext: () => void;
  /** Editing an existing goal: offer to save it without redoing the diagnosis. */
  editing?: boolean;
  onSaveOnly?: () => void;
  saving?: boolean;
  error?: string | null;
}

export function GoalStep({ draft, onChange, onNext, editing = false, onSaveOnly, saving = false, error }: GoalStepProps) {
  return (
    <div className="flex flex-col gap-5">
      <Card aria-label="刻意练习的四个要素" className="bg-indigo-50/70 dark:bg-indigo-950/30">
        <p className="text-base font-semibold text-slate-900 dark:text-white">这样练，进步才快</p>
        <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          “刻意练习”（Ericsson）有四个要素，这个软件把它们都放进了每天的练习里：
        </p>
        <ol className="mt-3 flex flex-col gap-2.5">
          {ELEMENTS.map((e, i) => (
            <li key={e.name} className="flex gap-3 text-sm">
              <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white dark:bg-indigo-500">
                {i + 1}
              </span>
              <span className="leading-relaxed text-slate-700 dark:text-slate-200">
                <strong className="font-semibold text-slate-900 dark:text-white">{e.name}</strong>：{e.body}
              </span>
            </li>
          ))}
        </ol>
      </Card>

      <Card className="flex flex-col gap-5">
        <Field label="练什么">
          <div>
            <Chip selected aria-pressed="true">
              日常口语与听力
            </Chip>
          </div>
        </Field>

        <Field label="计划周期" hint="周期越长，每天的压力越小；推荐 100 天。">
          <Segmented<number>
            full
            ariaLabel="计划周期"
            value={draft.horizonDays}
            onChange={(v) => onChange({ ...draft, horizonDays: v as GoalDraft['horizonDays'] })}
            options={HORIZONS.map((h) => ({
              value: h,
              label: (
                <span className="flex flex-col items-center leading-tight">
                  {h} 天{h === RECOMMENDED_HORIZON && <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">推荐</span>}
                </span>
              ),
            }))}
          />
        </Field>

        <Field label="每天时间" hint="推荐 20 分钟；每天的内容会按这个时间分成几块。">
          <Segmented<number>
            full
            ariaLabel="每天时间"
            value={draft.dailyMinutes}
            onChange={(v) => onChange({ ...draft, dailyMinutes: v })}
            options={MINUTES.map((m) => ({
              value: m,
              label: (
                <span className="flex flex-col items-center leading-tight">
                  {m} 分钟{m === RECOMMENDED_MINUTES && <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">推荐</span>}
                </span>
              ),
            }))}
          />
        </Field>
      </Card>

      {error && (
        <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
          {error}
        </p>
      )}
      <div className="flex flex-col gap-2.5">
        <Button variant="primary" size="lg" full onClick={onNext} disabled={saving}>
          {editing ? '保存并重新诊断' : '下一步：诊断测试'}
        </Button>
        {editing && onSaveOnly && (
          <Button variant="secondary" size="lg" full onClick={onSaveOnly} disabled={saving}>
            只保存目标
          </Button>
        )}
      </div>
    </div>
  );
}
