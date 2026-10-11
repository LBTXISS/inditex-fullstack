import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './app/App.jsx';
import { ErrorBoundary } from './app/ErrorBoundary.jsx';
import './styles.css';

// Fallar explícitamente ante una raíz ausente; StrictMode comprueba limpieza en desarrollo.
const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Missing application root');
createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary><BrowserRouter>
      <App />
    </BrowserRouter></ErrorBoundary>
  </StrictMode>,
);
