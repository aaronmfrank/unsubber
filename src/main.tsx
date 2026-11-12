import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { startServiceWorker } from './pwa';
import { App } from './ui/App';
import './index.css';

startServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
