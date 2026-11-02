import type { ReactNode } from 'react';
import { AdjustmentLog } from '../components/plan/AdjustmentLog';
import { AssessmentSection } from '../components/plan/AssessmentSection';
import { ComfortGauge } from '../components/plan/ComfortGauge';
import { CoachSection } from '../components/plan/CoachSection';
import { GoalCard } from '../components/plan/GoalCard';
import { PhaseTimeline } from '../components/plan/PhaseTimeline';
import { WeakSpots } from '../components/plan/WeakSpots';
import { PlanIcon } from '../components/icons';
import { ButtonLink, Card, EmptyState, PageHeader, PageLoading, SectionTitle } from '../components/ui';
import { defaultLadder, listenLevelZh, speakLevelZh } from '../lib/ladder';
import { usePlanData } from '../lib/planData';

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="mb-6">
      <SectionTitle>
        <span id={id}>{title}</span>
      </SectionTitle>
      <Card className="flex flex-col gap-4">{children}</Card>
    </section>
  );
}

/** 计划: goal, phase timeline, comfort-zone gauges, controller log, weak spots, assessments and the AI coach. */
export function PlanPage() {
  const data = usePlanData();
  if (!data) return <PageLoading />;
  const { profile, progress, stats, edge } = data;
  const goal = profile.goal;

  if (!goal || !progress) {
    return (
      <>
        <PageHeader title="计划" />
        <Card>
          <EmptyState
            icon={<PlanIcon size={36} />}
            title="还没有设定学习目标"
            description="刻意练习要有明确、可衡量的目标。花一分钟选好周期和每天的时长，再做一次 8–10 分钟的诊断，就能得到属于你的阶段计划。"
            action={
              <ButtonLink to="/onboarding" variant="primary" size="lg">
                设定目标
              </ButtonLink>
            }
          />
        </Card>
      </>
    );
  }

  const ladder = profile.adaptive?.ladder ?? { ...defaultLadder() };
  const current = { itemsLearned: progress.itemsLearned, ladder };

  return (
    <>
      <PageHeader title="计划" subtitle="明确的目标、舒适区边缘的难度、即时的反馈：这里看你离目标还有多远。" />
      <div className="mb-6">
        <GoalCard goal={goal} progress={progress} />
      </div>

      <Section id="plan-phases" title="阶段时间线">
        <PhaseTimeline plan={progress.plan} current={current} />
      </Section>

      <Section id="plan-comfort" title="舒适区仪表">
        <p className="rounded-xl bg-emerald-50 px-3.5 py-2.5 text-sm leading-relaxed text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
          正确率在绿色区间 = 练在舒适区边缘，进步最快；系统会自动调节难度把你保持在这里
        </p>
        <ComfortGauge skill="listen" stat={stats.bySkill.listen} levelZh={listenLevelZh(ladder.listen)} />
        <ComfortGauge skill="speak" stat={stats.bySkill.speak} levelZh={speakLevelZh(ladder.speak)} />
        <ComfortGauge skill="decode" stat={stats.bySkill.decode} />
        <p className="text-xs leading-relaxed text-slate-400 dark:text-slate-500">
          绿色区间是 70%–88%，参考 Wilson 等（2019）的“85% 法则”，是经验性的目标，不是精确定律。
        </p>
      </Section>

      <Section id="plan-history" title="调整记录">
        <AdjustmentLog history={profile.adaptive?.history ?? []} />
      </Section>

      <Section id="plan-weak" title="薄弱环节">
        <WeakSpots stats={stats} edge={edge} />
      </Section>

      <Section id="plan-assess" title="测评记录">
        <AssessmentSection assessments={profile.assessments ?? []} />
      </Section>

      <Section id="plan-coach" title="AI 教练">
        <CoachSection profile={profile} />
      </Section>
    </>
  );
}
