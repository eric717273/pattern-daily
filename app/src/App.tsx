import { HashRouter } from 'react-router-dom';
import { AppRoutes } from './routes';

/** HashRouter: the app is hosted on GitHub Pages under a sub-path. */
export default function App() {
  return (
    <HashRouter>
      <AppRoutes />
    </HashRouter>
  );
}
