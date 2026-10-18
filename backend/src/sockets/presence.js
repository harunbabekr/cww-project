// من هو متصل الآن (ذاكرة العملية الواحدة). عند التوسع لأكثر من خادم استبدلها بـ Redis.
const online = new Map(); // userId -> عدد الأجهزة/التبويبات المتصلة

export const markOnline = (id) => online.set(id, (online.get(id) || 0) + 1);
export const markOffline = (id) => {
  const n = (online.get(id) || 1) - 1;
  if (n <= 0) online.delete(id); else online.set(id, n);
};
export const isOnline = (id) => online.has(String(id));
export const onlineCount = () => online.size;
