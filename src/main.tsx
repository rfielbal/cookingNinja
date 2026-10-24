import React, { Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/outfit/400.css';
import '@fontsource/outfit/500.css';
import '@fontsource/outfit/600.css';
import '@fontsource/outfit/700.css';
import '@fontsource/outfit/800.css';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import './styles.css';

const Screen = lazy(() =>
  location.pathname.startsWith('/controller')
    ? import('./Controller')
    : location.pathname === '/atelier'
      ? import('./Atelier')
      : location.pathname === '/film'
        ? import('./ShowcaseFilm')
        : import('./App'),
);

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Suspense
      fallback={
        <div className="app-loading">
          Cooking<span>Ninja</span>
          <small>On prépare la cuisine…</small>
        </div>
      }
    >
      <Screen />
    </Suspense>
  </React.StrictMode>,
);
