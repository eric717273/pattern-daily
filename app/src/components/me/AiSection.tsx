import { useState } from 'react';
import { AiError, aiConfigured, testConnection } from '../../lib/ai';
import { useSettings } from '../../lib/settings';
import { EyeIcon, EyeOffIcon } from '../icons';
import { Button, Card, Field, SectionTitle, Segmented, Spinner, inputClass } from '../ui';

const MODELS = ['deepseek-chat', 'deepseek-reasoner'];

export function AiSection() {
  const [settings, update] = useSettings();
  const [show, setShow] = useState(false);
  const [test, setTest] = useState<{ state: 'idle' | 'testing' | 'ok' | 'error'; message?: string }>({ state: 'idle' });
  const configured = aiConfigured(settings);

  const runTest = async () => {
    setTest({ state: 'testing' });
    try {
      await testConnection();
      setTest({ state: 'ok', message: '连接成功，AI 功能可以使用了。' });
    } catch (e) {
      setTest({ state: 'error', message: e instanceof AiError ? e.message : '连接失败，请检查设置后重试。' });
    }
  };

  return (
    <section aria-labelledby="me-ai" className="mb-6">
      <SectionTitle>
        <span id="me-ai">AI 设置（DeepSeek）</span>
      </SectionTitle>
      <Card className="flex flex-col gap-4">
        <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400">
          AI 用于批改造句、解构任意句子、生成母框和每日造句题。没有 Key 也能完整使用其他功能。
        </p>

        <Field
          label="DeepSeek API Key"
          hint={
            <>
              没有 Key？到{' '}
              <a
                href="https://platform.deepseek.com/api_keys"
                target="_blank"
                rel="noreferrer"
                className="text-indigo-600 underline dark:text-indigo-300"
              >
                https://platform.deepseek.com/api_keys
              </a>{' '}
              创建一个。直连模式下 Key 只保存在本设备，不会同步。
            </>
          }
        >
          <div className="flex gap-2">
            <input
              type={show ? 'text' : 'password'}
              value={settings.deepseekApiKey}
              onChange={(e) => update({ deepseekApiKey: e.target.value.trim() })}
              aria-label="DeepSeek API Key"
              placeholder="sk-…"
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              className={`${inputClass} font-mono`}
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? '隐藏 Key' : '显示 Key'}
              aria-pressed={show}
              className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-slate-300 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              {show ? <EyeOffIcon size={20} /> : <EyeIcon size={20} />}
            </button>
          </div>
        </Field>

        <Field label="模型">
          <select
            value={settings.deepseekModel}
            onChange={(e) => update({ deepseekModel: e.target.value })}
            aria-label="模型"
            className={inputClass}
          >
            {MODELS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
            {!MODELS.includes(settings.deepseekModel) && (
              <option value={settings.deepseekModel}>{settings.deepseekModel}</option>
            )}
          </select>
        </Field>

        <Field label="连接方式">
          <Segmented<'direct' | 'proxy'>
            ariaLabel="连接方式"
            full
            value={settings.aiMode}
            onChange={(aiMode) => update({ aiMode })}
            options={[
              { value: 'direct', label: '直连' },
              { value: 'proxy', label: '通过 Supabase 代理' },
            ]}
          />
          <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            {settings.aiMode === 'direct'
              ? '直连：浏览器直接请求 DeepSeek。最简单；Key 只保存在这台设备上。'
              : '代理：请求经你自己的 Supabase Edge Function 转发，Key 存在服务器端，需要先配置并登录 Supabase。'}
          </p>
        </Field>

        <div className="flex flex-col gap-2">
          <Button
            variant="primary"
            size="lg"
            full
            disabled={!configured || test.state === 'testing'}
            onClick={() => void runTest()}
          >
            {test.state === 'testing' ? (
              <>
                <Spinner size={18} label="测试中" />
                测试中…
              </>
            ) : (
              '测试连接'
            )}
          </Button>
          {!configured && (
            <p className="text-xs text-slate-400 dark:text-slate-500">
              {settings.aiMode === 'direct' ? '先填写 API Key。' : '先配置 Supabase 并登录。'}
            </p>
          )}
          {test.state === 'ok' && (
            <p role="status" className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
              {test.message}
            </p>
          )}
          {test.state === 'error' && (
            <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
              {test.message}
            </p>
          )}
        </div>
      </Card>
    </section>
  );
}
