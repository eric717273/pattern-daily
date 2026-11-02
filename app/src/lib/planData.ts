import { useCallback, useEffect, useState } from 'react';
import type { ItemRef, Profile } from '../types';
import { getEdgeItems, getGoalProgress, getOrCreateProfile, getSkillStats, localChanges, type GoalProgress } from './repo';
import type { SkillStats } from './skills';

export interface PlanData {
  profile: Profile;
  progress?: GoalProgress;
  stats: SkillStats;
  edge: ItemRef[];
}

/** Everything the plan page shows, reloaded whenever local data changes. `undefined` while loading. */
export function usePlanData(): PlanData | undefined {
  const [data, setData] = useState<PlanData>();
  const load = useCallback(async () => {
    const [profile, progress, stats, edge] = await Promise.all([getOrCreateProfile(), getGoalProgress(), getSkillStats(), getEdgeItems()]);
    setData({ profile, progress, stats, edge });
  }, []);
  useEffect(() => {
    const run = () => void load().catch(() => undefined);
    run();
    localChanges.addEventListener('change', run);
    return () => localChanges.removeEventListener('change', run);
  }, [load]);
  return data;
}
