import { lazy, Suspense, type ComponentType, type ReactElement } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { PageLoading } from './components/ui';

/** Lazy-load a page module that exports its component by name. */
function page<K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K): ReactElement {
  const Page = lazy(async (): Promise<{ default: ComponentType }> => ({ default: (await load())[name] }));
  return (
    <Suspense fallback={<PageLoading />}>
      <Page />
    </Suspense>
  );
}

const today = page(() => import('./pages/TodayPage'), 'TodayPage');
const dozenList = page(() => import('./pages/DozenListPage'), 'DozenListPage');
const dozenDetail = page(() => import('./pages/DozenDetailPage'), 'DozenDetailPage');
const framesList = page(() => import('./pages/FramesListPage'), 'FramesListPage');
const frameDetail = page(() => import('./pages/FrameDetailPage'), 'FrameDetailPage');
const singleDrill = page(() => import('./pages/FrameDrillPages'), 'FrameSingleDrillPage');
const translateDrill = page(() => import('./pages/FrameDrillPages'), 'FrameTranslateDrillPage');
const analyze = page(() => import('./pages/AnalyzePage'), 'AnalyzePage');
const me = page(() => import('./pages/MePage'), 'MePage');
const notFound = page(() => import('./pages/NotFoundPage'), 'NotFoundPage');

/** All routes. Every page is a lazy chunk so the first load only ships the shell. */
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={today} />
        <Route path="dozen" element={dozenList} />
        <Route path="dozen/:id" element={dozenDetail} />
        <Route path="frames" element={framesList} />
        <Route path="frames/:id" element={frameDetail} />
        {/* Palmer step 2: single-slot quick swap drill */}
        <Route path="frames/:id/drill/single" element={singleDrill} />
        {/* Palmer step 3: Chinese -> English translate drill */}
        <Route path="frames/:id/drill/translate" element={translateDrill} />
        <Route path="analyze" element={analyze} />
        <Route path="me" element={me} />
        <Route path="*" element={notFound} />
      </Route>
    </Routes>
  );
}
