import { NavLink, useLocation } from 'react-router-dom';
import { PRIMARY, SETTINGS, UNDER_SETTINGS } from './nav';

/** شريط سفلي للجوال والتابلت (< 1024px): الصفحات الأساسية + الإعدادات (وفيها بقية الصفحات). */
export default function TabBar() {
  const { pathname } = useLocation();
  const settingsActive = UNDER_SETTINGS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const Tab = ({ name, path, icon: Icon, end, forceActive }) => (
    <NavLink to={path} end={end} className={({ isActive }) => `tab${isActive || forceActive ? ' active' : ''}`}>
      <span className="ico"><Icon /></span>
      <span className="lbl">{name}</span>
    </NavLink>
  );
  return (
    <nav className="tabbar" aria-label="التنقل">
      {PRIMARY.map((i) => <Tab key={i.path} {...i} />)}
      <Tab {...SETTINGS} forceActive={settingsActive} />
    </nav>
  );
}
