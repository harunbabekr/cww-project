import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Sidebar from './Sidebar';
import TabBar from './TabBar';
import CallOverlay from '../CallOverlay';
import RoomOverlay from '../RoomOverlay';

export default function AppLayout() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/auth" replace />;
  return (
    <div className="shell">
      <Sidebar />
      <main className="main">
        <div className="page">
          <Outlet />
        </div>
      </main>
      <TabBar />
      <CallOverlay />
      <RoomOverlay />
    </div>
  );
}
