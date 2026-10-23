import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef } from 'react';
import type { Scene } from '../../types';
import { db } from '../../lib/db';
import { SCENE_LABELS, SCENES } from '../../lib/labels';
import { getOrCreateProfile, updateProfile } from '../../lib/repo';
import { Card, Chip, Field, SectionTitle, Segmented } from '../ui';

const MINUTE_CHOICES = [10, 15, 20, 30];

export function PlanSection() {
  const profile = useLiveQuery(() => db.profile.get('profile'), []);
  useEffect(() => {
    void getOrCreateProfile();
  }, []);

  const minutes = profile?.dailyMinutes ?? 15;
  const scenes = profile?.scenes ?? ['work', 'daily'];

  // Taps are applied one after another on the stored profile, so quick successive taps never use stale data.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
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
        <Field label="偏好场景" hint="AI 出题和母框推荐会优先使用这些场景（至少保留一个）。">
          <div className="flex flex-wrap gap-2" role="group" aria-label="偏好场景">
            {SCENES.map((s) => (
              <Chip key={s} selected={scenes.includes(s)} onClick={() => toggle(s)}>
                {SCENE_LABELS[s]}
              </Chip>
            ))}
          </div>
        </Field>
        <p className="rounded-xl bg-slate-100 px-3.5 py-2.5 text-sm leading-relaxed text-slate-600 dark:bg-slate-800/70 dark:text-slate-300">
          「第 N 课」按你完成的课数推进，不是按日期：漏练一天不会跳过内容，所以不需要“重新开始计划”。
        </p>
      </Card>
    </section>
  );
}
