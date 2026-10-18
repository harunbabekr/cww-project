import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { CallProvider } from './context/CallContext';
import { RoomProvider } from './context/RoomContext';
import Invite from './pages/Invite';
import AppLayout from './components/layout/AppLayout';

import Auth from './pages/Auth';
import Home from './pages/Home';
import RealTimeFaceToFace from './pages/RealTimeFaceToFace';
import Calls from './pages/Calls';
import Chat from './pages/Chat';
import Watch from './pages/Watch';
import Dialects from './pages/Dialects';
import Support from './pages/Support';
import Settings from './pages/Settings';
import Admin from './pages/Admin';
import PwaUi from './components/PwaUi';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CallProvider>
          <RoomProvider>
          <PwaUi />
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/invite/:code" element={<Invite />} />
            <Route element={<AppLayout />}>
              <Route index element={<Home />} />
              <Route path="talk" element={<RealTimeFaceToFace />} />
              <Route path="calls" element={<Calls />} />
              <Route path="chat" element={<Chat />} />
              <Route path="watch" element={<Watch />} />
              <Route path="dialects" element={<Dialects />} />
              <Route path="support" element={<Support />} />
              <Route path="settings" element={<Settings />} />
              <Route path="admin" element={<Admin />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </RoomProvider>
        </CallProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
