import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import './index.css';
import App from './App';
import { getOrCreateProfile } from './lib/repo';
import { startAutoSync } from './lib/sync';

void getOrCreateProfile().catch(() => undefined);
startAutoSync();
registerSW({ immediate: true });

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
