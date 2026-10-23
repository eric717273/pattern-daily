import { useEffect, useState } from 'react';
import { listVoices, speak } from '../../lib/speech';
import { useSettings } from '../../lib/settings';
import { SpeakerIcon } from '../icons';
import { Button, Card, Field, SectionTitle, inputClass } from '../ui';

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

  return (
    <section aria-labelledby="me-speech" className="mb-6">
      <SectionTitle>
        <span id="me-speech">朗读设置</span>
      </SectionTitle>
      <Card className="flex flex-col gap-4">
        <Field
          label="英语声音"
          hint={voices && voices.length === 0 ? '这台设备没有可用的英语声音，朗读功能可能不可用。' : '默认会自动选择最清晰的美式英语声音。'}
        >
          <select
            value={settings.ttsVoiceURI}
            onChange={(e) => update({ ttsVoiceURI: e.target.value })}
            aria-label="英语声音"
            className={inputClass}
          >
            <option value="">自动选择（推荐）</option>
            {(voices ?? []).map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name}（{v.lang}）
              </option>
            ))}
          </select>
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

        <Button
          onClick={() => void speak('The apple is red. I can give it to him tomorrow.', { rate: settings.ttsRate })}
          aria-label="试听朗读"
        >
          <SpeakerIcon size={18} />
          试听
        </Button>
      </Card>
    </section>
  );
}
