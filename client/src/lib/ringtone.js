// نغمة رنين بسيطة بالـ WebAudio (بدون ملفات صوت)
let ctx = null, timer = null;

export function startRing() {
  stopRing();
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const beep = () => {
      [0, 0.28].forEach((d) => {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
        const t = ctx.currentTime + d;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
        o.start(t); o.stop(t + 0.25);
      });
    };
    beep();
    timer = setInterval(beep, 2000);
  } catch { /* المتصفح منع الصوت */ }
}

export function stopRing() {
  clearInterval(timer); timer = null;
  ctx?.close().catch(() => {}); ctx = null;
}
