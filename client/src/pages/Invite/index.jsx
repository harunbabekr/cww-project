import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { LoaderCircle } from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import api, { errMsg } from '../../services/api';
import Logo from '../../components/layout/Logo';

// /invite/:code — يعمل قبل الدخول وبعده
export default function Invite() {
  const { code } = useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [inviter, setInviter] = useState(null);
  const [state, setState] = useState('loading'); // loading | ready | invalid | done | error
  const [msg, setMsg] = useState('');

  useEffect(() => {
    axios.get(`${api.defaults.baseURL}/invite/${code}`)
      .then((r) => { setInviter(r.data.inviter); setState('ready'); })
      .catch(() => setState('invalid'));
  }, [code]);

  const accept = async () => {
    try { await api.post(`/invite/${code}/accept`); setState('done'); setTimeout(() => navigate('/calls', { replace: true }), 1200); }
    catch (e) { setMsg(errMsg(e)); setState('error'); }
  };

  const goAuth = () => { localStorage.setItem('cww_invite', code); navigate('/auth'); };

  return (
    <div className="splash" style={{ background: 'var(--sand)' }}>
      <div className="card stack" style={{ width: 'min(420px, 92vw)', textAlign: 'center', alignItems: 'center' }}>
        <Logo size={56} />
        {(state === 'loading' || loading) && <LoaderCircle className="spin" />}
        {state === 'invalid' && <><h2>رابط الدعوة غير صالح</h2><Link className="btn" to="/">الذهاب للتطبيق</Link></>}
        {!loading && (state === 'ready' || state === 'error') && (
          <>
            <h2>{inviter.name} يدعوك إلى CWW</h2>
            <p className="muted">تكلّم وافهم جميع لغات العالم: مكالمات ورسائل مترجمة فورياً.</p>
            {state === 'error' && <div className="alert error">{msg}</div>}
            {user
              ? <button className="btn primary" onClick={accept}>إضافة {inviter.name} إلى جهات اتصالي</button>
              : <><button className="btn primary" onClick={goAuth}>إنشاء حساب / تسجيل الدخول</button><small className="muted">ستُضاف إلى جهات {inviter.name} تلقائياً بعد الدخول.</small></>}
          </>
        )}
        {state === 'done' && <div className="alert info">تمت الإضافة ✓ جارٍ فتح المكالمات…</div>}
      </div>
    </div>
  );
}
