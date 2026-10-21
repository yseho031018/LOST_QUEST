import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { MatchNotificationProvider } from './context/MatchNotificationContext';
import App from './App';
import { loadRuntimeApiBaseUrl } from './services/runtimeConfig';
import './styles.css';

function render() {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <BrowserRouter>
        <AppProvider><MatchNotificationProvider><App /></MatchNotificationProvider></AppProvider>
      </BrowserRouter>
    </React.StrictMode>,
  );
}

// Read the current tunnel address (if configured) before the first API request; falls back within 3 seconds.
void loadRuntimeApiBaseUrl().finally(render);
