import webpush from 'web-push';
import PushSubscription from '../models/PushSubscription.js';
import DeviceToken from '../models/DeviceToken.js';

let ready = false;
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@example.com', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  ready = true;
}

// ---- FCM لتطبيق فلاتر (اختياري): FIREBASE_SERVICE_ACCOUNT = JSON الحساب الخدمي أو base64 له ----
let fcm = null;
(async () => {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return;
  try {
    const json = JSON.parse(raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'));
    const admin = (await import('firebase-admin')).default;
    if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(json) });
    fcm = admin.messaging();
  } catch (e) {
    console.warn('[CWW] FCM غير مفعّل:', e.message);
  }
})();

export const pushAvailable = () => ready || !!fcm;
export const vapidPublicKey = () => process.env.VAPID_PUBLIC_KEY || null;

/** يرسل إشعاراً لكل أجهزة المستخدم المشتركة ويحذف الاشتراكات المنتهية */
export async function notifyUser(userId, payload) {
  if (!ready && !fcm) return 0;
  const subs = ready ? await PushSubscription.find({ user: userId }) : [];
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(payload), { TTL: payload.type === 'call' ? 30 : 3600, urgency: payload.type === 'call' ? 'high' : 'normal' });
        sent += 1;
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) await PushSubscription.deleteOne({ _id: s._id });
      }
    })
  );

  if (fcm) {
    const tokens = await DeviceToken.find({ user: userId });
    const isCall = payload.type === 'call';
    const data = {};
    for (const k of ['type', 'title', 'body', 'url', 'tag']) if (payload[k] != null) data[k] = String(payload[k]);
    await Promise.all(
      tokens.map(async (t) => {
        try {
          await fcm.send({
            token: t.token,
            data, // المكالمات: بيانات فقط ليعالجها التطبيق ويعرض شاشة اتصال
            ...(isCall ? {} : { notification: { title: payload.title, body: payload.body } }),
            android: { priority: 'high', ttl: isCall ? 30000 : 3600000 },
            apns: { headers: { 'apns-priority': isCall ? '10' : '5' }, payload: { aps: { alert: { title: payload.title, body: payload.body }, sound: 'default' } } },
          });
          sent += 1;
        } catch (err) {
          if (['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(err.code)) await DeviceToken.deleteOne({ _id: t._id });
        }
      })
    );
  }
  return sent;
}
