import { useEffect, useState } from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';
import { useOnline } from '../lib/pwa';

/** شريط عدم الاتصال + إشعار توفر تحديث للتطبيق */
export default function PwaUi() {
  const online = useOnline();
  const [apply, setApply] = useState(null);
  const [toast, setToast] = useState('');
  useEffect(() => {
    const h = (e) => { setToast(e.detail); setTimeout(() => setToast(''), 3500); };
    window.addEventListener('cww:toast', h);
    return () => window.removeEventListener('cww:toast', h);
  }, []);

  useEffect(() => {
    const h = (e) => setApply(() => e.detail);
    window.addEventListener('cww:update', h);
    return () => window.removeEventListener('cww:update', h);
  }, []);

  return (
    <>
      {!online && (
        <div className="offline-bar" role="status"><WifiOff size={16} /> لا يوجد اتصال — الترجمة والمكالمات تحتاج إنترنت</div>
      )}
      {apply && (
        <div className="update-toast" role="status">
          <span>يتوفر إصدار جديد من التطبيق</span>
          <button className="btn small primary" onClick={apply}><RefreshCw /> تحديث</button>
        </div>
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
