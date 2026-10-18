import api from '../services/api';

const b64ToUint8 = (b64) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
};

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export async function pushEnabled() {
  if (!pushSupported()) return false;
  const reg = await navigator.serviceWorker.getRegistration();
  return !!(reg && (await reg.pushManager.getSubscription()) && Notification.permission === 'granted');
}

export async function enablePush() {
  if (!pushSupported()) throw new Error('المتصفح لا يدعم الإشعارات (على iPhone ثبّت التطبيق على الشاشة الرئيسية أولاً)');
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) throw new Error('الإشعارات تعمل في النسخة المبنية فقط: npm run build ثم npm run preview');
  if ((await Notification.requestPermission()) !== 'granted') throw new Error('لم تسمح بالإشعارات');

  const { data } = await api.get('/users/push/key');
  if (!data.key) throw new Error('الإشعارات غير مفعّلة على الخادم (VAPID)');
  const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(data.key) }));
  await api.post('/users/push/subscribe', sub.toJSON());
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await api.post('/users/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe();
}
