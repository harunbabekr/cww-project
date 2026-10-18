import Contact from '../models/Contact.js';

const ensure = async (owner, contact, nickname) => {
  const res = await Contact.updateOne(
    { owner, contact },
    { $setOnInsert: { owner, contact }, ...(nickname ? { $set: { nickname } } : {}) },
    { upsert: true }
  );
  return !!res.upsertedCount;
};

/**
 * يربط مستخدمَين كجهتَي اتصال متبادلتين (حتى يستطيع كل منهما الاتصال بالآخر ومراسلته).
 * يعيد { createdForOther } لنعرف هل نُبلّغ الطرف الآخر.
 */
export async function linkUsers(me, other, { nickname } = {}) {
  const [, createdForOther] = await Promise.all([ensure(me, other, nickname), ensure(other, me)]);
  return { createdForOther };
}

export const shapeContact = (c, isOnline) => ({
  id: c._id,
  nickname: c.nickname,
  user: {
    id: c.contact._id,
    name: c.contact.name,
    phone: c.contact.fullPhone,
    online: isOnline ? isOnline(String(c.contact._id)) : false,
    settings: { speakLanguage: c.contact.settings?.speakLanguage },
  },
});
