import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { registerSW } from './lib/pwa';
import './index.css';

registerSW((apply) => window.dispatchEvent(new CustomEvent('cww:update', { detail: apply })));

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
