// تشغيل: npm run seed — يضيف المجموعات والمصطلحات الأولية المعتمدة (ويضيف فيديوهات إن وُجد مدير)
import 'dotenv/config';
import mongoose from 'mongoose';
import DialectDictionary from '../models/DialectDictionary.js';
import DialectGroup from '../models/DialectGroup.js';
import VideoContent from '../models/VideoContent.js';
import User from '../models/User.js';
import { DEFAULT_GROUPS, SEED_ENTRIES } from './seedData.js';

await mongoose.connect(process.env.MONGO_URI);

for (const g of DEFAULT_GROUPS) await DialectGroup.updateOne({ name: g.name }, { $setOnInsert: g }, { upsert: true });

for (const [dialect, word, meaning, examples = [], variants = []] of SEED_ENTRIES) {
  const group = DEFAULT_GROUPS.find((g) => g.name === dialect);
  const doc = new DialectDictionary({
    word, dialect, standardMeaning: meaning, examples, variants, status: 'approved',
    language: group?.mtLanguage || (group?.category === 'tribal' ? group.code : 'ar'),
  });
  await doc.validate();
  await DialectDictionary.updateOne({ word, dialect }, { $setOnInsert: { ...doc.toObject(), _id: undefined } }, { upsert: true });
}

const admin = await User.findOne({ role: 'admin' });
if (admin) {
  const videos = [
    { title: 'Big Buck Bunny', category: 'movie', originalLanguage: 'en', tags: ['animation'], videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4', thumbnailUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/BigBuckBunny.jpg', description: 'فيلم رسوم متحركة قصير مفتوح المصدر' },
    { title: 'Elephants Dream', category: 'movie', originalLanguage: 'en', tags: ['animation'], videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4', thumbnailUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/ElephantsDream.jpg', description: 'أول فيلم مفتوح المصدر من مؤسسة بلندر (فيه حوار مناسب لتجربة الدبلجة)' },
  ];
  for (const v of videos) await VideoContent.updateOne({ title: v.title }, { $setOnInsert: { ...v, uploader: admin._id } }, { upsert: true });
}
console.log('Seed done');
await mongoose.disconnect();
