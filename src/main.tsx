import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'



import { ToastProvider } from './context/toastContext.tsx'

// Global overrides to prevent Electron keyboard focus loss when native alert/confirm dialogs are dismissed
const originalAlert = window.alert;
window.alert = function (message) {
  const activeEl = document.activeElement;
  originalAlert(message);
  setTimeout(() => {
    if (activeEl && typeof (activeEl as any).focus === 'function') {
      (activeEl as any).focus();
    } else {
      document.body.focus();
    }
  }, 100);
};

const originalConfirm = window.confirm;
window.confirm = function (message) {
  const activeEl = document.activeElement;
  const result = originalConfirm(message);
  setTimeout(() => {
    if (activeEl && typeof (activeEl as any).focus === 'function') {
      (activeEl as any).focus();
    } else {
      document.body.focus();
    }
  }, 100);
  return result;
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>,
)

// Register Progressive Web App (PWA) service worker on production builds
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      console.log('Service worker registered successfully:', reg.scope);
    }).catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  });
}

