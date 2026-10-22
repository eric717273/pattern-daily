import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { FramePattern } from '../components/FramePattern';
import { FrameTable } from '../components/FrameTable';
import { GrammarTags } from '../components/GrammarTag';
import { ChevronRightIcon } from '../components/icons';
import { SpeakButton } from '../components/SpeakButton';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  ConfirmDialog,
  EmptyState,
  PageHeader,
  PageLoading,
  SectionTitle,
} from '../components/ui';
import { DOZEN } from '../content';
import { useAllFrames, useCard } from '../lib/hooks';
import { FRAME_LEVEL_LABELS, SCENE_LABELS } from '../lib/labels';
import { deleteUserFrame, ensureCards } from '../lib/repo';

export function FrameDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const frames = useAllFrames();
  const { loading, card } = useCard('frame', id);
  const frame = useMemo(() => frames?.find((f) => f.id === id), [frames, id]);

  // Picks are remembered together with the frame id, so every frame starts from its first options.
  const [pickState, setPickState] = useState<{ id: string; picks: Record<string, number> }>({ id, picks: {} });
  const picks = pickState.id === id ? pickState.picks : {};
  const setPicks = (p: Record<string, number>) => setPickState({ id, picks: p });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!frames) return <PageLoading />;

  if (!frame) {
    return (
      <>
        <PageHeader title="母框" backTo="/frames" backLabel="全部母框" />
        <EmptyState
          title="找不到这个母框"
          description="它可能已被删除。"
          action={<ButtonLink to="/frames">返回母框列表</ButtonLink>}
        />
      </>
    );
  }

  const related = DOZEN.filter(
    (d) => d.frameIds.includes(frame.id) || d.grammar.some((g) => frame.grammar.includes(g)),
  );
  const editable = frame.source !== 'seed';

  const addToReview = async () => {
    setBusy(true);
    try {
      await ensureCards('frame', [frame.id]);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await deleteUserFrame(frame.id);
      void navigate('/frames', { replace: true });
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  };

  return (
    <>
      <PageHeader
        backTo="/frames"
        backLabel="全部母框"
        title={frame.title}
        subtitle={
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge tone="slate">{SCENE_LABELS[frame.scene]}</Badge>
            <Badge tone={frame.level === 1 ? 'emerald' : frame.level === 2 ? 'amber' : 'rose'}>
              {FRAME_LEVEL_LABELS[frame.level]}
            </Badge>
            {frame.source === 'ai' && <Badge tone="violet">AI 生成</Badge>}
            {frame.source === 'user' && <Badge tone="violet">自建</Badge>}
            <GrammarTags points={frame.grammar} className="contents" />
          </span>
        }
      />

      <Card className="mb-5">
        <FramePattern frame={frame} />
        <FramePattern frame={frame} lang="zh" className="mt-1" />
        {frame.tipZh && (
          <p className="mt-3 border-t border-slate-100 pt-3 text-sm leading-relaxed text-slate-600 dark:border-slate-800 dark:text-slate-300">
            <span className="mr-1.5 font-semibold text-indigo-600 dark:text-indigo-400">用法</span>
            {frame.tipZh}
          </p>
        )}
      </Card>

      <section className="mb-5">
        <SectionTitle>替换表</SectionTitle>
        <FrameTable frame={frame} picks={picks} onChange={setPicks} />
      </section>

      <section className="mb-5">
        <SectionTitle>示范句</SectionTitle>
        <Card as="ul" padded={false} className="divide-y divide-slate-100 dark:divide-slate-800">
          {frame.examples.map((ex, i) => (
            <li key={i} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="font-en text-[17px] leading-snug text-slate-900 dark:text-slate-100">{ex.en}</p>
                <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{ex.zh}</p>
              </div>
              <SpeakButton text={ex.en} />
            </li>
          ))}
        </Card>
      </section>

      {/* PHASE 2 hooks: these two buttons route to the drill pages registered in routes.tsx. */}
      <section className="mb-5" aria-label="练习">
        <SectionTitle>练习</SectionTitle>
        <Card>
          <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
            帕默三步：先读熟整句，再单槽快替，最后看中文用母框组句。
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <ButtonLink to={`/frames/${frame.id}/drill/single`} variant="primary">
              单槽快替
            </ButtonLink>
            <ButtonLink to={`/frames/${frame.id}/drill/translate`} variant="primary">
              中译英
            </ButtonLink>
          </div>
        </Card>
      </section>

      {related.length > 0 && (
        <section className="mb-5">
          <SectionTitle>对应的解构句</SectionTitle>
          <ul className="flex flex-col gap-2">
            {related.map((d) => (
              <li key={d.id}>
                <Link to={`/dozen/${d.id}`} className="block rounded-2xl">
                  <Card interactive padded={false} className="flex items-center gap-3 px-4 py-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-200">
                      {d.order}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-en truncate text-base font-medium text-slate-900 dark:text-slate-100">{d.en}</p>
                      <p className="truncate text-sm text-slate-500 dark:text-slate-400">{d.zh}</p>
                    </div>
                    <ChevronRightIcon size={18} className="shrink-0 text-slate-300 dark:text-slate-600" />
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mb-4 flex flex-wrap gap-3">
        {loading ? null : card ? (
          <Button disabled>已在复习中</Button>
        ) : (
          <Button variant="primary" disabled={busy} onClick={() => void addToReview()}>
            加入复习
          </Button>
        )}
        {editable && (
          <Button variant="danger" disabled={busy} onClick={() => setConfirmDelete(true)}>
            删除这个母框
          </Button>
        )}
      </div>
      <ConfirmDialog
        open={confirmDelete}
        danger
        title="删除这个母框？"
        message="删除后它会从列表中消失（并同步到其他设备），已加入的复习卡片不受影响。"
        confirmLabel="删除"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void remove()}
      />
    </>
  );
}
