import { Link } from 'react-router-dom';
import { Mic, Phone, MessageCircle, Clapperboard, BookA, LifeBuoy, ArrowLeftRight, Download, Share } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { langName } from '../../lib/languages';
import { useInstall } from '../../lib/pwa';
import { PageHeader } from '../../components/ui';

const tiles = [
  { to: '/talk', icon: Mic, color: '#e4572e', title: 'المحادثة في الواقع', text: 'تحدّث وجهاً لوجه مع من يتكلم لغة أخرى، وتُنطق الترجمة فوراً.' },
  { to: '/calls', icon: Phone, color: '#2ba39b', title: 'مكالمة صوت وفيديو', text: 'مكالمات مباشرة مع ترجمة نصية وصوتية أثناء الحديث.' },
  { to: '/chat', icon: MessageCircle, color: '#3d4a9c', title: 'دردشة الرسائل', text: 'كل طرف يقرأ الرسائل بلغته، فرادى أو في مجموعات.' },
  { to: '/watch', icon: Clapperboard, color: '#d9a441', title: 'المشاهدات', text: 'محاضرات وأفلام مدبلجة أو مترجمة للغتك.' },
  { to: '/dialects', icon: BookA, color: '#8a4b7b', title: 'اللهجات والرطانات', text: 'قاموس مصطلحات اللهجات المحلية وتحويلها إلى لغة مفهومة.' },
  { to: '/support', icon: LifeBuoy, color: '#0f2a2e', title: 'تواصل معنا', text: 'أرسل ملاحظاتك بلغتك، وقيّم التطبيق.' },
];

export default function Home() {
  const { user } = useAuth();
  const install = useInstall();
  const s = user.settings;
  return (
    <>
      <PageHeader eyebrow="CWW" title={`أهلاً ${user.name}`} subtitle="اختر الطريقة التي تريد التواصل بها اليوم." />

      {!install.installed && (install.canPrompt || install.iosHint) && (
        <div className="card install-banner">
          <div><strong>ثبّت CWW على جهازك</strong><p className="muted">يعمل كتطبيق مستقل ويصلك إشعار المكالمات والرسائل.</p></div>
          {install.canPrompt
            ? <button className="btn primary" onClick={install.install}><Download /> تثبيت</button>
            : <span className="chip"><Share size={14} /> مشاركة ← إضافة إلى الشاشة الرئيسية</span>}
        </div>
      )}

      <div className="card hero-card">
        <div><h2>تكلّم وافهم جميع لغات العالم</h2><p>لغتك ولغة المتكلم الآخر يمكن تغييرهما من الإعدادات.</p></div>
        <Link to="/settings" className="row" style={{ background: 'rgba(255,255,255,.1)', padding: '10px 18px', borderRadius: 14 }}>
          <b>{langName(s.speakLanguage)}</b><ArrowLeftRight size={18} /><b>{langName(s.targetLanguage)}</b>
        </Link>
      </div>

      <div className="grid cols-3">
        {tiles.map(({ to, icon: Icon, color, title, text }) => (
          <Link key={to} to={to} className="card tile">
            <div className="tile-icon" style={{ background: color }}><Icon /></div>
            <h3>{title}</h3><p>{text}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
