import { useRef, useState, type ChangeEvent } from 'react';
import { todayStr } from '../../lib/plan';
import { exportData, importData } from '../../lib/repo';
import { Button, Card, SectionTitle } from '../ui';

export function BackupSection() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const doExport = async () => {
    setBusy(true);
    setResult(null);
    try {
      const json = await exportData();
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `pattern-daily-${todayStr()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setResult({ ok: true, text: '已导出备份文件。' });
    } catch {
      setResult({ ok: false, text: '导出失败，请重试。' });
    } finally {
      setBusy(false);
    }
  };

  const doImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setResult(null);
    try {
      await importData(await file.text());
      setResult({ ok: true, text: `导入成功：${file.name}。数据已合并到当前设备。` });
    } catch (err) {
      setResult({ ok: false, text: err instanceof Error ? err.message : '导入失败。' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="me-backup" className="mb-6">
      <SectionTitle>
        <span id="me-backup">数据备份</span>
      </SectionTitle>
      <Card className="flex flex-col gap-3">
        <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400">
          所有学习数据都保存在这台设备上。可以导出成 JSON 文件备份，或在新设备上导入（导入会与现有数据合并）。
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Button disabled={busy} onClick={() => void doExport()}>
            导出 JSON
          </Button>
          <Button disabled={busy} onClick={() => fileRef.current?.click()}>
            导入
          </Button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          aria-label="选择备份文件"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => void doImport(e)}
        />
        {result && (
          <p
            role={result.ok ? 'status' : 'alert'}
            className={result.ok ? 'text-sm font-medium text-emerald-700 dark:text-emerald-400' : 'text-sm text-rose-600 dark:text-rose-400'}
          >
            {result.text}
          </p>
        )}
      </Card>
    </section>
  );
}
