import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import socketService from '../services/socket';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [socket, setSocket] = useState(null);
  const [loading, setLoading] = useState(true);

  const startSession = useCallback((token, nextUser) => {
    localStorage.setItem('cww_token', token);
    setUser(nextUser);
    setSocket(socketService.connect(token));
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('cww_token');
    socketService.disconnect();
    setSocket(null);
    setUser(null);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('cww_token');
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get('/auth/me')
      .then((res) => {
        setUser(res.data.user);
        setSocket(socketService.connect(token));
      })
      .catch(() => localStorage.removeItem('cww_token'))
      .finally(() => setLoading(false));
  }, []);

  // دعوة مخزّنة قبل التسجيل: نقبلها فور الدخول فيصبح الداعي والمدعو جهتَي اتصال
  useEffect(() => {
    const code = localStorage.getItem('cww_invite');
    if (!user || !code) return;
    localStorage.removeItem('cww_invite');
    api.post(`/invite/${code}/accept`)
      .then((r) => window.dispatchEvent(new CustomEvent('cww:toast', { detail: `تمت إضافة ${r.data.contact.user.name} إلى جهات اتصالك` })))
      .catch(() => {});
  }, [user]);

  // طرف آخر أضافني
  useEffect(() => {
    if (!socket) return undefined;
    const h = (d) => window.dispatchEvent(new CustomEvent('cww:toast', { detail: `${d.name} أضافك إلى جهات اتصاله` }));
    socket.on('contact:added', h);
    return () => socket.off('contact:added', h);
  }, [socket]);

  useEffect(() => {
    window.addEventListener('cww:unauthorized', logout);
    return () => window.removeEventListener('cww:unauthorized', logout);
  }, [logout]);

  const refresh = async () => {
    const { data } = await api.get('/auth/me');
    setUser(data.user);
    return data.user;
  };
  const register = (payload) => api.post('/auth/register', payload).then((r) => r.data);
  const login = async (identifier, password) => {
    const { data } = await api.post('/auth/login', { identifier, password });
    startSession(data.token, data.user);
  };
  const forgot = (identifier, channel) => api.post('/auth/forgot', { identifier, channel }).then((r) => r.data);
  const reset = async (identifier, code, newPassword) => {
    const { data } = await api.post('/auth/reset', { identifier, code, newPassword });
    startSession(data.token, data.user);
  };
  const changePassword = async (currentPassword, newPassword) => {
    const { data } = await api.patch('/users/me/password', { currentPassword, newPassword });
    // التوكن القديم أُبطل: نحفظ الجديد ونعيد اتصال السوكت به
    localStorage.setItem('cww_token', data.token);
    socketService.disconnect();
    setSocket(socketService.connect(data.token));
  };
  const verify = async (email, code) => {
    const { data } = await api.post('/auth/verify', { email, code });
    startSession(data.token, data.user);
  };
  const updateSettings = async (patch) => {
    const { data } = await api.patch('/users/me/settings', patch);
    setUser(data.user);
    return data.user;
  };

  const value = useMemo(
    () => ({ user, socket, loading, register, login, forgot, reset, changePassword, verify, updateSettings, refresh, logout }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, socket, loading, logout]
  );

  if (loading) return <div className="splash"><span className="spinner" /></div>;
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);
