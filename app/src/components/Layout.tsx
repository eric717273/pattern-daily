import { useEffect, type ComponentType } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { AnalyzeIcon, FramesIcon, MeIcon, TodayIcon } from './icons';
import { cx } from './ui';

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
  Icon: ComponentType<{ size?: number }>;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: '今日', end: true, Icon: TodayIcon },
  { to: '/library', label: '语块库', Icon: FramesIcon },
  { to: '/decode', label: '解码', Icon: AnalyzeIcon },
  { to: '/me', label: '我的', Icon: MeIcon },
];

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo?.(0, 0);
  }, [pathname]);
  return null;
}

/**
 * App shell. Mobile: content + fixed bottom tab bar (safe-area aware).
 * >= 768px: fixed left sidebar, content centered at max 880px.
 */
export function Layout() {
  return (
    <div className="min-h-dvh">
      <ScrollToTop />
      {/* Dark scrim under the translucent iOS status bar (its text is always white). */}
      <div
        aria-hidden="true"
        className="fixed inset-x-0 top-0 z-40 h-[env(safe-area-inset-top)] bg-slate-900 dark:bg-slate-950"
      />

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-slate-200 bg-white/80 px-4 pt-8 pb-6 backdrop-blur md:flex dark:border-slate-800 dark:bg-slate-900/60">
        <div className="mb-8 px-3">
          <p className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">句型日练</p>
          <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">Pattern Daily · 每天 15 分钟</p>
        </div>
        <nav aria-label="主导航" className="flex flex-col gap-1">
          {NAV_ITEMS.map(({ to, label, end, Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cx(
                  'flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium transition-colors',
                  isActive
                    ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800',
                )
              }
            >
              <Icon size={20} />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className="pt-[env(safe-area-inset-top)] pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-12 md:pl-60">
        <div className="mx-auto w-full max-w-[880px] px-4 pt-5 md:px-8 md:pt-10">
          <Outlet />
        </div>
      </main>

      <nav
        aria-label="底部导航"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden dark:border-slate-800 dark:bg-slate-900/90"
      >
        <div className="grid grid-cols-5">
          {NAV_ITEMS.map(({ to, label, end, Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cx(
                  'flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors',
                  isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400',
                )
              }
            >
              <Icon size={23} />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
