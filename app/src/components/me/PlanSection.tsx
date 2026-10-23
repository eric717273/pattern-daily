import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef } from 'react';
import type { Scene } from '../../types';
import { db } from '../../lib/db';
import { SCENE_LABELS, SCENES } from '../../lib/labels';
import { clampNewPerDay, DEFAULT_NEW_PER_DAY, MAX_NEW_PER_DAY, MIN_NEW_PER_DAY } from '../../lib/plan';
import { getOrCreateProfile, updateProfile } from '../../lib/repo';
import { Button, Card, Chip, Field, SectionTitle, Segmented } from '../ui';

const MINUTE_CHOICES = [10, 15, 20, 30];

export function PlanSection() {
  const profile = useLiveQuery(() => db.profile.get('profile'), []);
  useEffect(() => {
    void getOrCreateProfile();
  }, []);

  // Taps are applied one after another on the stored profile, so quick successive taps never use stale data.
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  const minutes = profile?.dailyMinutes ?? 15;
  const scenes = profile?.scenes ?? ['work', 'daily'];
  const newPerDay = clampNewPerDay(profile?.newPerDay ?? DEFAULT_NEW_PER_DAY);

  // Read the stored value, so quick successive taps on + / - never use a stale number.
  const stepNewPerDay = (delta: number) => {
    queue.current = queue.current.then(async () => {
      const current = clampNewPerDay((await getOrCreateProfile()).newPerDay);
      const next = clampNewPerDay(current + delta);
      if (next !== current) await updateProfile({ newPerDay: next });
    });
  };

  const toggle = (s: Scene) => {
    queue.current = queue.current.then(async () => {
      const current = (await getOrCreateProfile()).scenes;
      const next = current.includes(s) ? current.filter((x) => x !== s) : [...current, s];
      if (next.length === 0) return; // keep at least one preferred scene
      await updateProfile({ scenes: next });
    });
  };

  return (
    <section aria-labelledby="me-plan" className="mb-6">
      <SectionTitle>
        <span id="me-plan">学习计划</span>
      </SectionTitle>
      <Card className="flex flex-col gap-4">
        <Field label="每天学习时长" hint="用来估算今日剩余时间；每天的内容固定为四步。">
          <Segmented<number>
            ariaLabel="每天学习时长"
            value={MINUTE_CHOICES.includes(minutes) ? minutes : 15}
            onChange={(m) => void updateProfile({ dailyMinutes: m })}
            options={MINUTE_CHOICES.map((m) => ({ value: m, label: `${m} 分钟` }))}
          />
        </Field>
        <Field label="每天新语块数量" hint="从下一课开始生效（今天的内容已经定好，不会中途改变）。">
          <div className="flex items-center gap-3" role="group" aria-label="每天新语块数量">
            <Button
              size="sm"
              aria-label="减少每天新语块数量"
              disabled={newPerDay <= MIN_NEW_PER_DAY}
              onClick={() => stepNewPerDay(-1)}
            >
              −
            </Button>
            <output aria-live="polite" className="min-w-16 text-center text-lg font-bold text-slate-900 tabular-nums dark:text-white" data-testid="new-per-day">
              {newPerDay} 条
            </output>
            <Button
              size="sm"
              aria-label="增加每天新语块数量"
              disabled={newPerDay >= MAX_NEW_PER_DAY}
              onClick={() => stepNewPerDay(1)}
            >
              +
            </Button>
            <span className="text-xs text-slate-400 dark:text-slate-500">
              范围 {MIN_NEW_PER_DAY}–{MAX_NEW_PER_DAY}，默认 {DEFAULT_NEW_PER_DAY}
            </span>
          </div>
        </Field>
        <Field label="偏好场景" hint="AI 出题和母框推荐会优先使用这些场景（至少保留一个）。">
          <div className="flex flex-wrap gap-2" role="group" aria-label="偏好场景">
            {SCENES.map((s) => (
              <Chip key={s} selected={scenes.includes(s)} onClick={() => toggle(s)}>
                {SCENE_LABELS[s]}
              </Chip>
            ))}
          </div>
        </Field>
        <div className="flex flex-col gap-2.5 rounded-xl bg-slate-100 px-3.5 py-3 text-sm leading-relaxed text-slate-600 dark:bg-slate-800/70 dark:text-slate-300" data-testid="plan-explain">
          <p className="font-medium text-slate-800 dark:text-slate-100">两条互相独立的学习线</p>
          <p>
            <span className="font-medium text-slate-800 dark:text-slate-100">解码</span>
            ：前 13 课每天学一个骨架句（逐字对照、陷阱、变形练习），之后每天约 3 分钟维护。练的是看懂结构。
          </p>
          <p>
            <span className="font-medium text-slate-800 dark:text-slate-100">语块</span>
            ：每天 {newPerDay} 条新语块 + 间隔复习，约 400 条（150 个母框 + 250 条固定表达）。练的是脱口而出，不讲语法。
          </p>
          <p>「第 N 课」按你完成的课数推进，不是按日期：漏练一天不会跳过内容，所以不需要“重新开始计划”。</p>
        </div>
      </Card>
    </section>
  );
}
