import { useEffect, useState } from 'react';
import api from '../services/api';

let cache = null;
let inflight = null;
const load = () => (inflight ||= api.get('/meta/features').then((r) => (cache = r.data.features)).catch(() => (inflight = null)));

const EMPTY = { otp: {}, stt: {}, tts: {}, voiceClone: false, push: false, dialectAI: false, dubbing: false, weakAsr: [] };

/** ميزات الخادم المفعّلة (حسب المفاتيح الموجودة في .env) */
export function useFeatures() {
  const [f, setF] = useState(cache || EMPTY);
  useEffect(() => { if (!cache) load().then((v) => v && setF(v)); }, []);
  return f;
}
