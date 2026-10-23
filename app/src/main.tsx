import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import './index.css';
import App from './App';
import { getOrCreateProfile } from './lib/repo';

void getOrCreateProfile().catch(() => undefined);
// Load the sync engine (supabase-js) after the shell so it stays out of the entry chunk.
void import('./lib/sync').then((m) => m.startAutoSync());
registerSW({ immediate: true });

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
