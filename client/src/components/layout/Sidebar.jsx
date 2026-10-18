import { NavLink } from 'react-router-dom';
import { House, Mic, Phone, MessageCircle, Clapperboard, BookA, LifeBuoy, Settings, LogOut, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import Logo from './Logo';

const links = [
  { name: 'الرئيسية', path: '/', icon: House, end: true },
  { name: 'وجهاً لوجه', path: '/talk', icon: Mic },
  { name: 'المكالمات', path: '/calls', icon: Phone },
  { name: 'الرسائل', path: '/chat', icon: MessageCircle },
  { name: 'المشاهدات', path: '/watch', icon: Clapperboard },
  { name: 'اللهجات', path: '/dialects', icon: BookA },
  { name: 'تواصل معنا', path: '/support', icon: LifeBuoy },
  { name: 'الإعدادات', path: '/settings', icon: Settings },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const items = ['admin', 'moderator'].includes(user?.role) ? [...links, { name: 'الإدارة', path: '/admin', icon: ShieldCheck }] : links;
  return (
    <aside className="sidebar">
      <div className="brand"><Logo /></div>
      <nav className="nav">
        {items.map(({ name, path, icon: Icon, end }) => (
          <NavLink key={path} to={path} end={end} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            <Icon />
            <span>{name}</span>
          </NavLink>
        ))}
      </nav>
      <button className="nav-link logout" onClick={logout} title="تسجيل الخروج">
        <LogOut />
        <span>خروج</span>
      </button>
    </aside>
  );
}
