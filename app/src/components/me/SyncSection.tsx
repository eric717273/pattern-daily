import { useEffect, useState } from 'react';
import {
  currentUserEmail,
  sendOtp,
  signOut,
  syncConfigured,
  syncNow,
  useSyncStatus,
  verifyOtp,
  type SyncState,
} from '../../lib/sync';
import { useSettings } from '../../lib/settings';
import { Badge, Button, Card, Field, SectionTitle, Spinner, inputClass, type Tone } from '../ui';

const STATE_LABEL: Record<SyncState, { label: string; tone: Tone }> = {
  off: { label: '未配置', tone: 'slate' },
  'signed-out': { label: '未登录', tone: 'amber' },
  idle: { label: '已同步', tone: 'emerald' },
  syncing: { label: '同步中…', tone: 'sky' },
  error: { label: '同步出错', tone: 'rose' },
  offline: { label: '离线', tone: 'slate' },
};

function message(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

export function SyncSection() {
  const [settings, update] = useSettings();
  const status = useSyncStatus();
  const configured = syncConfigured();
  const [email, setEmail] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState<null | 'send' | 'verify' | 'sync' | 'out'>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void currentUserEmail().then((e) => {
      if (!cancelled) setEmail(e);
    });
    return () => {
      cancelled = true;
    };
  }, [status.state, settings.supabaseUrl, settings.supabaseAnonKey]);

  const run = async (kind: NonNullable<typeof busy>, fn: () => Promise<void>, fallback: string) => {
    setBusy(kind);
    setError(null);
    setInfo(null);
    try {
      await fn();
    } catch (e) {
      setError(message(e, fallback));
    } finally {
      setBusy(null);
    }
  };

  const signedIn = configured && email !== null;
  const badge = STATE_LABEL[status.state];

  const configFields = (
    <div className="flex flex-col gap-3">
      <Field label="Supabase 项目 URL">
        <input
          type="url"
          value={settings.supabaseUrl}
          onChange={(e) => update({ supabaseUrl: e.target.value })}
          aria-label="Supabase 项目 URL"
          placeholder="https://xxxx.supabase.co"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className={inputClass}
        />
      </Field>
      <Field label="Supabase anon key">
        <input
          type="text"
          value={settings.supabaseAnonKey}
          onChange={(e) => update({ supabaseAnonKey: e.target.value })}
          aria-label="Supabase anon key"
          placeholder="eyJ…"
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          className={`${inputClass} font-mono`}
        />
      </Field>
    </div>
  );

  return (
    <section aria-labelledby="me-sync" className="mb-6">
      <SectionTitle
        aside={configured ? <Badge tone={badge.tone}>{badge.label}</Badge> : undefined}
      >
        <span id="me-sync">多设备同步（Supabase）</span>
      </SectionTitle>
      <Card className="flex flex-col gap-4">
        {!configured ? (
          <>
            <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400">
              可选功能：用你自己的免费 Supabase 项目，让 iPhone 和 Mac 的学习进度保持一致。不配置也完全可以离线使用。
              创建项目、运行迁移和填写这两项的步骤见仓库里的 <code className="rounded bg-slate-100 px-1 py-0.5 text-[13px] dark:bg-slate-800">docs/SETUP.md</code>。
            </p>
            {configFields}
          </>
        ) : !signedIn ? (
          <>
            <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400">
              用邮箱登录后会自动同步。我们会发一封带 6 位验证码的邮件，不需要密码。
            </p>
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                void run(
                  'send',
                  async () => {
                    await sendOtp(emailInput);
                    setCodeSent(true);
                    setInfo('验证码已发送，请查收邮件（也看看垃圾邮件箱）。');
                  },
                  '发送验证码失败。',
                );
              }}
            >
              <Field label="邮箱">
                <input
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  aria-label="邮箱"
                  placeholder="you@example.com"
                  autoComplete="email"
                  autoCapitalize="off"
                  className={inputClass}
                />
              </Field>
              <Button type="submit" variant={codeSent ? 'secondary' : 'primary'} disabled={busy !== null || !emailInput.includes('@')}>
                {busy === 'send' ? '发送中…' : codeSent ? '重新发送验证码' : '发送验证码'}
              </Button>
            </form>
            {codeSent && (
              <form
                className="flex flex-col gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(
                    'verify',
                    async () => {
                      await verifyOtp(emailInput, code);
                      setCode('');
                      setCodeSent(false);
                      setEmail(await currentUserEmail());
                    },
                    '验证失败。',
                  );
                }}
              >
                <Field label="6 位验证码">
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]*"
                    maxLength={8}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    aria-label="6 位验证码"
                    placeholder="123456"
                    className={`${inputClass} tracking-[0.3em]`}
                  />
                </Field>
                <Button type="submit" variant="primary" disabled={busy !== null || code.length < 6}>
                  {busy === 'verify' ? '验证中…' : '验证并登录'}
                </Button>
              </form>
            )}
            <details className="text-sm text-slate-500 dark:text-slate-400">
              <summary className="min-h-11 cursor-pointer py-2">修改 Supabase 连接信息</summary>
              <div className="pt-2">{configFields}</div>
            </details>
          </>
        ) : (
          <>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-slate-500 dark:text-slate-400">账号</dt>
              <dd className="min-w-0 truncate font-medium text-slate-900 dark:text-slate-100" data-testid="sync-email">
                {email}
              </dd>
              <dt className="text-slate-500 dark:text-slate-400">状态</dt>
              <dd>
                <Badge tone={badge.tone}>{badge.label}</Badge>
              </dd>
              <dt className="text-slate-500 dark:text-slate-400">上次同步</dt>
              <dd className="text-slate-900 dark:text-slate-100">
                {status.lastSyncedAt ? new Date(status.lastSyncedAt).toLocaleString('zh-CN') : '还没有同步过'}
              </dd>
            </dl>
            {status.state === 'error' && status.error && (
              <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
                {status.error}
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="primary"
                disabled={busy !== null || status.state === 'syncing'}
                onClick={() =>
                  void run(
                    'sync',
                    async () => {
                      const r = await syncNow();
                      setInfo(`同步完成：上传 ${r.pushed} 条，下载 ${r.pulled} 条。`);
                    },
                    '同步失败。',
                  )
                }
              >
                {busy === 'sync' || status.state === 'syncing' ? <Spinner size={16} label="同步中" /> : null}
                立即同步
              </Button>
              <Button
                disabled={busy !== null}
                onClick={() =>
                  void run(
                    'out',
                    async () => {
                      await signOut();
                      setEmail(null);
                    },
                    '退出失败。',
                  )
                }
              >
                退出登录
              </Button>
            </div>
          </>
        )}
        {info && (
          <p role="status" className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
            {info}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}
      </Card>
    </section>
  );
}
