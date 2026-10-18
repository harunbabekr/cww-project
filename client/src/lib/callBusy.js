// يمنع تداخل المكالمة الفردية مع الجماعية (كل منهما يسجّل حالته هنا)
const state = { call: false, room: false };
export const setBusy = (kind, v) => { state[kind] = !!v; };
export const isBusy = (kind) => !!state[kind];

// إبقاء الشاشة مضيئة أثناء المكالمة
let lock = null;
export async function keepAwake(on) {
  try {
    if (on && 'wakeLock' in navigator && !lock) lock = await navigator.wakeLock.request('screen');
    else if (!on && lock) { await lock.release(); lock = null; }
  } catch { lock = null; }
}
