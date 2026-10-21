import { NavLink } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import Logo from './Logo';
import { PRIMARY, SECONDARY, SETTINGS, ADMIN, isStaff } from './nav';

const Item = ({ name, path, icon: Icon, end }) => (
  <NavLink to={path} end={end} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
    <Icon />
    <span>{name}</span>
  </NavLink>
);

/** قائمة جانبية: تظهر على الشاشات العريضة فقط (≥ 1024px). */
export default function Sidebar() {
  const { user, logout } = useAuth();
  return (
    <aside className="sidebar" aria-label="القائمة الرئيسية">
      <div className="brand"><Logo /><strong>CWW</strong></div>
      <nav className="nav">
        {PRIMARY.map((i) => <Item key={i.path} {...i} />)}
        <div className="nav-label">المزيد</div>
        {SECONDARY.map((i) => <Item key={i.path} {...i} name={i.short || i.name} />)}
        {isStaff(user) && <Item {...ADMIN} />}
      </nav>
      <div className="nav-foot">
        <Item {...SETTINGS} />
        <button className="nav-link" onClick={logout}><LogOut /><span>تسجيل الخروج</span></button>
      </div>
    </aside>
  );
}
