import { isStandalone } from '../../lib/standalone';
import { Card, SectionTitle } from '../ui';

export function InstallSection() {
  if (isStandalone()) return null;
  return (
    <section aria-labelledby="me-install" className="mb-6">
      <SectionTitle>
        <span id="me-install">安装到设备</span>
      </SectionTitle>
      <Card className="flex flex-col gap-4">
        <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400">
          安装后会像 App 一样全屏打开，也可以离线使用。
        </p>
        <div>
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">iPhone（Safari）</h3>
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            <li>用 Safari 打开本页面。</li>
            <li>点底部的「分享」按钮。</li>
            <li>选择「添加到主屏幕」，再点「添加」。</li>
          </ol>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Mac（Safari）</h3>
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            <li>用 Safari 打开本页面。</li>
            <li>菜单栏选择「文件」→「添加到程序坞」。</li>
            <li>确认名称后点「添加」。</li>
          </ol>
        </div>
      </Card>
    </section>
  );
}
