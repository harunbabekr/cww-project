import { House, Mic, Phone, MessageCircle, Clapperboard, BookA, LifeBuoy, Settings, ShieldCheck } from 'lucide-react';

// الصفحات الأساسية: تظهر في الشريط السفلي (الجوال/التابلت) وفي القائمة الجانبية (الحاسوب)
export const PRIMARY = [
  { name: 'الرئيسية', path: '/', icon: House, end: true },
  { name: 'وجهاً لوجه', path: '/talk', icon: Mic },
  { name: 'المكالمات', path: '/calls', icon: Phone },
  { name: 'الرسائل', path: '/chat', icon: MessageCircle },
];

export const SETTINGS = { name: 'الإعدادات', path: '/settings', icon: Settings };

// صفحات ثانوية: تُفتح من «الإعدادات» في الجوال، وتظهر في القائمة الجانبية على الحاسوب
export const SECONDARY = [
  { name: 'المشاهدات', path: '/watch', icon: Clapperboard, text: 'محاضرات وأفلام مترجمة أو مدبلجة' },
  { name: 'اللهجات والرطانات', short: 'اللهجات', path: '/dialects', icon: BookA, text: 'قاموس اللهجات المحلية وترجمتها' },
  { name: 'تواصل معنا', path: '/support', icon: LifeBuoy, text: 'راسل الإدارة وقيّم التطبيق' },
];

export const ADMIN = { name: 'الإدارة', path: '/admin', icon: ShieldCheck, text: 'لوحة الإدارة' };

export const isStaff = (user) => ['admin', 'moderator'].includes(user?.role);

// مسارات تُعدّ تابعة لتبويب «الإعدادات» في الشريط السفلي
export const UNDER_SETTINGS = [SETTINGS, ...SECONDARY, ADMIN].map((i) => i.path);
