import { useEffect, useState } from 'react';

/** تسجيل الـ service worker (في النسخة المبنية فقط) */
export function registerSW(onUpdate) {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      const offer = () => reg.waiting && onUpdate(() => reg.waiting.postMessage('SKIP_WAITING'));
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw?.addEventListener('statechange', () => { if (nw.state === 'installed' && navigator.serviceWorker.controller) offer(); });
      });
      offer();
      setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded) { reloaded = true; location.reload(); } });
    } catch (e) { console.warn('SW registration failed', e); }
  });
}

// حدث التثبيت يصل مبكراً، فنلتقطه على مستوى الوحدة
let deferred = null;
const subs = new Set();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; subs.forEach((f) => f()); });
  window.addEventListener('appinstalled', () => { deferred = null; subs.forEach((f) => f()); });
}

export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

export function useInstall() {
  const [, tick] = useState(0);
  useEffect(() => { const f = () => tick((n) => n + 1); subs.add(f); return () => subs.delete(f); }, []);
  return {
    installed: isStandalone(),
    canPrompt: !!deferred,
    iosHint: isIOS() && !isStandalone(),
    install: async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice; deferred = null; tick((n) => n + 1); },
  };
}

export function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true); const off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return online;
}
