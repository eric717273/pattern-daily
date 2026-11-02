import { Button, Card } from '../../components/ui';

export interface IntroStepProps {
  onStart: () => void;
  onSkip: () => void;
  onBack: () => void;
  busy?: boolean;
  error?: string | null;
}

export function IntroStep({ onStart, onSkip, onBack, busy = false, error }: IntroStepProps) {
  return (
    <div className="flex flex-col gap-5">
      <Card className="flex flex-col gap-3.5" aria-label="诊断测试说明">
        <div>
          <p className="text-base font-semibold text-slate-900 dark:text-white">先测一下你现在的水平</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">大约 8–10 分钟，共 22 题：12 道听辨、2 道对话主旨题、8 道限时口语。</p>
        </div>
        <ul className="flex flex-col gap-2.5 text-sm leading-relaxed text-slate-700 dark:text-slate-200">
          <li>
            <strong className="text-slate-900 dark:text-white">测什么：</strong>
            你能听清多快的英语（听力起点），以及能多快说出常用表达（口语起点）。答得好的高频语块会直接记为已学，不必重复学。
          </li>
          <li>
            <strong className="text-slate-900 dark:text-white">不会“不及格”：</strong>
            这不是考试，错题很正常。结果只用来把每天的难度定在“踮脚够得着”的位置。
          </li>
          <li>
            <strong className="text-slate-900 dark:text-white">需要声音：</strong>
            请打开设备声音，最好戴上耳机，在安静的地方做。
          </li>
          <li>
            <strong className="text-slate-900 dark:text-white">麦克风可选：</strong>
            口语题可以开语音识别，也可以自己对答案后点“说对了”。设备不支持识别或关闭了语音验证时，会自动改为自评。
          </li>
        </ul>
      </Card>

      {error && (
        <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
          {error}
        </p>
      )}
      <div className="flex flex-col gap-2.5">
        <Button variant="primary" size="lg" full onClick={onStart} disabled={busy}>
          开始诊断
        </Button>
        <Button variant="ghost" size="lg" full onClick={onSkip} disabled={busy}>
          先跳过诊断
        </Button>
        <Button variant="ghost" size="sm" onClick={onBack} disabled={busy} className="self-center">
          返回修改目标
        </Button>
      </div>
      <p className="text-center text-xs text-slate-400 dark:text-slate-500">跳过后会使用默认难度（听力 L1、口语 S1），以后可以在“计划”里随时补测。</p>
    </div>
  );
}
