import React from 'react';
import ReactDOM from 'react-dom/client';
import { init, miniApp, themeParams, viewport } from '@telegram-apps/sdk-react';
import App from './App';

import './mockEnv.ts';
import './index.css';

init();

if (miniApp.mount.isAvailable()) {
  miniApp.mount();
}
if (themeParams.mount.isAvailable()) {
  themeParams.mount();
}
if (viewport.mount.isAvailable()) {
  viewport.mount().catch(e => console.error('Viewport mount error:', e));
}

miniApp.ready();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
