import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { registerSW } from './lib/pwa';
import './index.css';

// استيراد ملفات التجاوب المنفصلة لكل جزء من التطبيق
import './styles/01-base-variables.css';
import './styles/02-layout-sidebar.css';
import './styles/03-home-face-to-face.css';
import './styles/04-chat-contacts.css';
import './styles/05-calls-overlays.css';
import './styles/06-watch-dialects.css';
import './styles/07-auth-settings-support-admin.css';
import './styles/responsive-helper.js';

registerSW((apply) => window.dispatchEvent(new CustomEvent('cww:update', { detail: apply })));

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
