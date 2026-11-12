import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { startServiceWorker } from './pwa';
import { startTheme } from './theme';
import { App } from './ui/App';
import './index.css';

startTheme();
startServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
