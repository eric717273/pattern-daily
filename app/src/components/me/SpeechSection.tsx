import { useEffect, useState } from 'react';
import { MicCheck } from '../drills/MicCheck';
import { hasHighQualityVoice, listVoices, pickVoice, recognitionSupported, speak, voiceQuality } from '../../lib/speech';
import { useSettings } from '../../lib/settings';
import { SpeakerIcon } from '../icons';
import { Button, Card, Field, SectionTitle } from '../ui';

const SAMPLE = 'The apple is red. I can give it to him tomorrow.';

function VoiceRow({
  voice,
  label,
  checked,
  onPick,
  rate,
}: {
  voice: SpeechSynthesisVoice | null;
  label: string;
  checked: boolean;
  onPick: () => void;
  rate: number;
}) {
  return (
    <li className="flex items-center gap-2">
      <label className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm text-slate-800 dark:text-slate-100">
        <input type="radio" name="tts-voice" checked={checked} onChange={onPick} aria-label={label} className="size-4 accent-indigo-600" />
        <span className="min-w-0 flex-1 truncate">{label}</span>
      </label>
      <Button size="sm" variant="ghost" aria-label={`试听 ${label}`} onClick={() => void speak(SAMPLE, { rate, voice: voice ?? undefined })}>
        <SpeakerIcon size={16} />
        试听
      </Button>
    </li>
  );
}

/** Card shown when no downloaded premium / enhanced English voice exists. */
export function InstallVoicesCard() {
  return (
    <div
      className="flex flex-col gap-2 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm leading-relaxed text-amber-950 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100"
      data-testid="install-voices"
    >
      <p className="font-semibold">安装免费的高质量语音（约 1 分钟）</p>
      <p>网页只能使用系统自带的声音。系统里有免费的高质量声音，下载后朗读会自然很多：</p>
      <ol className="ml-5 list-decimal space-y-1.5">
        <li>
          <strong>Mac：</strong>系统设置 → 辅助功能 → 朗读内容 → 系统声音 旁的 ⓘ /「管理声音…」→ 英语（美国）→ 下载 Ava（高级）、Zoe（高级）、Evan（增强）等。
        </li>
        <li>
          <strong>iPhone：</strong>设置 → 辅助功能 → 朗读内容 → 声音 → 英语 → 选择 Ava 等并下载（高级 / 增强）。
        </li>
      </ol>
      <p className="text-xs">下载完成后，完全退出并重新打开 Safari / 本 App，新声音才会出现在这里。</p>
    </div>
  );
}

export function SpeechSection() {
  const [settings, update] = useSettings();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listVoices().then((v) => {
      if (!cancelled) setVoices(v);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const list = voices ?? [];
  const high = list.filter((v) => {
    const q = voiceQuality(v);
    return q === 'premium' || q === 'enhanced';
  });
  const normal = list.filter((v) => !high.includes(v));
  const auto = pickVoice(list, '');
  const selected = list.some((v) => v.voiceURI === settings.ttsVoiceURI) ? settings.ttsVoiceURI : '';

  const group = (title: string, items: SpeechSynthesisVoice[]) =>
    items.length > 0 && (
      <div role="group" aria-label={title}>
        <p className="mb-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">{title}</p>
        <ul className="flex flex-col">
          {items.map((v) => (
            <VoiceRow
              key={v.voiceURI}
              voice={v}
              label={`${v.name}（${v.lang}）`}
              checked={selected === v.voiceURI}
              onPick={() => update({ ttsVoiceURI: v.voiceURI })}
              rate={settings.ttsRate}
            />
          ))}
        </ul>
      </div>
    );

  return (
    <section aria-labelledby="me-speech" className="mb-6">
      <SectionTitle>
        <span id="me-speech">朗读设置</span>
      </SectionTitle>
      <Card className="flex flex-col gap-4">
        {voices !== null && !hasHighQualityVoice(voices) && <InstallVoicesCard />}

        <Field
          label="英语声音"
          hint={voices && voices.length === 0 ? '这台设备没有可用的英语声音，朗读功能可能不可用。' : '默认会自动选择最自然的美式英语声音。'}
        >
          <div role="radiogroup" aria-label="英语声音" className="flex max-h-72 flex-col gap-2 overflow-y-auto">
            <ul>
              <VoiceRow
                voice={auto}
                label={auto ? `自动选择（推荐，当前：${auto.name}）` : '自动选择（推荐）'}
                checked={selected === ''}
                onPick={() => update({ ttsVoiceURI: '' })}
                rate={settings.ttsRate}
              />
            </ul>
            {group('高质量', high)}
            {group('普通', normal)}
          </div>
        </Field>

        <Field label={`语速 ${settings.ttsRate.toFixed(2)}×`}>
          <input
            type="range"
            min={0.5}
            max={1.5}
            step={0.05}
            value={settings.ttsRate}
            onChange={(e) => update({ ttsRate: Number(e.target.value) })}
            aria-label="朗读语速"
            className="h-11 w-full accent-indigo-600"
          />
          <div className="flex justify-between text-xs text-slate-400 dark:text-slate-500">
            <span>慢</span>
            <span>快</span>
          </div>
        </Field>

        <Button onClick={() => void speak(SAMPLE, { rate: settings.ttsRate })} aria-label="试听朗读">
          <SpeakerIcon size={18} />
          试听
        </Button>

        {recognitionSupported() && (
          <div className="border-t border-slate-200 pt-4 dark:border-slate-700">
            <MicCheck />
          </div>
        )}
      </Card>
    </section>
  );
}
