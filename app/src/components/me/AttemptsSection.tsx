import { useLiveQuery } from 'dexie-react-hooks';
import { listAttempts } from '../../lib/repo';
import { SpeakButton } from '../SpeakButton';
import { Badge, Card, SectionTitle } from '../ui';

export function AttemptsSection() {
  const attempts = useLiveQuery(() => listAttempts(undefined, 10), []);
  return (
    <section aria-labelledby="me-attempts" className="mb-6">
      <SectionTitle>
        <span id="me-attempts">最近练习</span>
      </SectionTitle>
      {!attempts || attempts.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {attempts ? '还没有造句记录。完成今日练习的第 4 步后，这里会显示你的句子和批改。' : '加载中…'}
          </p>
        </Card>
      ) : (
        <Card as="ul" padded={false} className="divide-y divide-slate-100 dark:divide-slate-800">
          {attempts.map((a) => {
            const fb = a.feedback;
            const tone = fb ? (fb.score >= 85 ? 'emerald' : fb.score >= 60 ? 'amber' : 'rose') : 'slate';
            return (
              <li key={a.id} className="px-4 py-3">
                {a.promptZh && <p className="text-sm text-slate-500 dark:text-slate-400">{a.promptZh}</p>}
                <div className="mt-1 flex items-start gap-2">
                  <p className="font-en min-w-0 flex-1 text-[16px] text-slate-900 dark:text-slate-100">{a.userEn}</p>
                  <Badge tone={tone}>{fb ? `${fb.score} 分` : '未批改'}</Badge>
                </div>
                {fb && fb.corrected.trim() !== a.userEn.trim() && (
                  <div className="mt-1.5 flex items-center gap-2">
                    <p className="font-en min-w-0 flex-1 text-[15px] font-medium text-emerald-700 dark:text-emerald-400">
                      {fb.corrected}
                    </p>
                    <SpeakButton text={fb.corrected} />
                  </div>
                )}
              </li>
            );
          })}
        </Card>
      )}
    </section>
  );
}
