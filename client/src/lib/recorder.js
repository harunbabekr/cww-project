export const recordingSupported = () => !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);

export function pickMime() {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  return candidates.find((t) => window.MediaRecorder?.isTypeSupported?.(t)) || '';
}

export const getMic = () =>
  navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });

/** تسجيل مقطع واحد: يعيد { stop() → Promise<{blob, mime, ms}> } */
export function recordClip(stream) {
  const wanted = pickMime();
  const rec = new MediaRecorder(stream, wanted ? { mimeType: wanted } : undefined);
  const chunks = [];
  const t0 = Date.now();
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.start();
  return {
    stop: () =>
      new Promise((resolve) => {
        const finish = () => {
          const mime = rec.mimeType || wanted || 'audio/webm';
          resolve({ blob: new Blob(chunks, { type: mime }), mime, ms: Date.now() - t0 });
        };
        if (rec.state === 'inactive') return finish();
        rec.onstop = finish;
        rec.stop();
      }),
  };
}

/**
 * يلتقط الجمل تلقائياً من بث صوتي (للمكالمات): يبدأ التسجيل عند الكلام وينهيه عند الصمت.
 * isPaused(): لتجاهل الالتقاط أثناء تشغيل الترجمة المنطوقة (منعاً للصدى).
 */
export function createUtteranceRecorder(stream, { onUtterance, isPaused, threshold = 0.025, silenceMs = 1000, minMs = 700, maxMs = 20000 }) {
  const audioOnly = new MediaStream(stream.getAudioTracks());
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  ctx.resume?.().catch(() => {});
  const an = ctx.createAnalyser();
  an.fftSize = 1024;
  ctx.createMediaStreamSource(audioOnly).connect(an);
  const buf = new Uint8Array(an.fftSize);

  let clip = null, startedAt = 0, lastVoice = 0, stopped = false;
  const level = () => {
    an.getByteTimeDomainData(buf);
    let s = 0;
    for (const v of buf) { const x = (v - 128) / 128; s += x * x; }
    return Math.sqrt(s / buf.length);
  };

  const finish = (discard) => {
    const c = clip; const voiced = lastVoice - startedAt; clip = null;
    c.stop().then((r) => { if (!discard && voiced >= minMs) onUtterance(r); });
  };

  const timer = setInterval(() => {
    if (stopped) return;
    const now = Date.now(); const paused = isPaused?.(); const lv = level();
    if (!clip) {
      if (!paused && lv > threshold) { clip = recordClip(audioOnly); startedAt = now; lastVoice = now; }
    } else {
      if (lv > threshold) lastVoice = now;
      if (paused) finish(true);
      else if (now - lastVoice > silenceMs || now - startedAt > maxMs) finish(false);
    }
  }, 80);

  return { stop: () => { stopped = true; clearInterval(timer); if (clip) finish(true); ctx.close().catch(() => {}); } };
}

export const sendAudio = (api, path, blob, mime, params) =>
  api.post(path, blob, { params, headers: { 'Content-Type': mime || blob.type || 'audio/webm' }, transformRequest: [(d) => d] });
