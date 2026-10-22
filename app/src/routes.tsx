import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { AnalyzePage } from './pages/AnalyzePage';
import { DozenDetailPage } from './pages/DozenDetailPage';
import { DozenListPage } from './pages/DozenListPage';
import { DrillPlaceholder } from './pages/DrillPlaceholder';
import { FrameDetailPage } from './pages/FrameDetailPage';
import { FramesListPage } from './pages/FramesListPage';
import { MePage } from './pages/MePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { TodayPage } from './pages/TodayPage';

/**
 * All routes. Phase 2: replace the page placeholders (TodayPage / AnalyzePage / MePage) and the two
 * `DrillPlaceholder` routes with the real implementations - keep the paths.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<TodayPage />} />
        <Route path="dozen" element={<DozenListPage />} />
        <Route path="dozen/:id" element={<DozenDetailPage />} />
        <Route path="frames" element={<FramesListPage />} />
        <Route path="frames/:id" element={<FrameDetailPage />} />
        {/* PHASE 2: single-slot quick swap drill (Palmer step 2) */}
        <Route path="frames/:id/drill/single" element={<DrillPlaceholder mode="single" />} />
        {/* PHASE 2: Chinese -> English translate drill (Palmer step 3) */}
        <Route path="frames/:id/drill/translate" element={<DrillPlaceholder mode="translate" />} />
        <Route path="analyze" element={<AnalyzePage />} />
        <Route path="me" element={<MePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
