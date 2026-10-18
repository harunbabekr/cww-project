// حالة مشتركة بين معالجات المكالمات (1:1 والجماعية) لمنع التداخل
export const ringing = new Map();     // calleeId -> بيانات مكالمة ترنّ
export const directCalls = new Map(); // userId -> { peer, logId, answeredAt }
export const roomOf = new Map();      // userId -> roomId (غرفة مكالمة جماعية منضم إليها)

export const isBusy = (id) => ringing.has(String(id)) || directCalls.has(String(id)) || roomOf.has(String(id));
