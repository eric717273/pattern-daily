import { lazy, Suspense, type ComponentType, type ReactElement } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
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
const dozenDetail = page(() => import('./pages/DozenDetailPage'), 'DozenDetailPage');
const library = page(() => import('./pages/library/LibraryPage'), 'LibraryPage');
const chunkDetail = page(() => import('./pages/library/ChunkDetailPage'), 'ChunkDetailPage');
const decode = page(() => import('./pages/decode/DecodePage'), 'DecodePage');
const decodePractice = page(() => import('./pages/decode/DecodePracticePage'), 'DecodePracticePage');
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
        {/* Chunk track (Palmer + lexical chunks): automatic recall and recognition */}
        <Route path="library" element={library} />
        <Route path="library/chunk/:id" element={chunkDetail} />
        <Route path="frames/:id" element={frameDetail} />
        <Route path="frames/:id/drill/single" element={singleDrill} />
        <Route path="frames/:id/drill/translate" element={translateDrill} />
        {/* Decode track (Ferriss): understanding sentence skeletons */}
        <Route path="decode" element={decode} />
        <Route path="decode/dozen/:id" element={dozenDetail} />
        <Route path="decode/practice" element={decodePractice} />
        <Route path="decode/analyze" element={analyze} />
        {/* v1 paths */}
        <Route path="frames" element={<Navigate to="/library" replace />} />
        <Route path="dozen" element={<Navigate to="/decode" replace />} />
        <Route path="dozen/:id" element={dozenDetail} />
        <Route path="analyze" element={<Navigate to="/decode/analyze" replace />} />
        <Route path="me" element={me} />
        <Route path="*" element={notFound} />
      </Route>
    </Routes>
  );
}
