import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('cww_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401 && localStorage.getItem('cww_token')) {
      localStorage.removeItem('cww_token');
      window.dispatchEvent(new Event('cww:unauthorized'));
    }
    return Promise.reject(error);
  }
);

export const errMsg = (e) =>
  e?.response?.data?.message || (e?.code === 'ERR_NETWORK' ? 'تعذّر الاتصال بالخادم' : e?.message) || 'حدث خطأ غير متوقع';

export default api;

export function getFriendlyErrorMessage(error) {
  // في حال انقطاع الإنترنت أو استيقاظ سيرفر Render المجاني
  if (!error?.response && (error?.message === 'Network Error' || error?.code === 'ECONNABORTED')) {
    return 'تعذر الاتصال بالخادم، يرجى التحقق من اتصال الإنترنت أو الانتظار لحظات';
  }

  const serverMsg = error?.response?.data?.message || error?.message || '';

  // منع ظهور أي رسائل إنجليزية تقنية أو أكواد برمجية للمستخدم
  if (
    !serverMsg ||
    /network error|failed to fetch|cors|status code|unexpected token|groq|elevenlabs|axios/i.test(serverMsg)
  ) {
    return 'حدث خلل مؤقت أثناء تنفيذ العملية، يرجى المحاولة مرة أخرى';
  }

  return serverMsg;
}
