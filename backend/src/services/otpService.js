import { AppError } from '../middlewares/errorHandler.js';

const env = (k) => process.env[k];

export const availableChannels = () => ({
  email: !!(env('BREVO_API_KEY') && env('BREVO_SENDER_EMAIL')),
  sms: !!(env('TWILIO_ACCOUNT_SID') && env('TWILIO_AUTH_TOKEN') && env('TWILIO_VERIFY_SERVICE_SID')),
});

const emailHtml = (name, code, purpose) => `
<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;max-width:420px;margin:auto;padding:24px;border:1px solid #e3d9c6;border-radius:16px;background:#fbf8f2">
  <h2 style="margin:0 0 8px;color:#0f2a2e">CWW — ${purpose === 'reset' ? 'استعادة كلمة المرور' : 'تأكيد الحساب'}</h2>
  <p style="color:#444">أهلاً ${String(name).replace(/[<>&]/g, '')}، رمز التأكيد الخاص بك:</p>
  <p style="font-size:34px;letter-spacing:10px;font-weight:700;color:#e4572e;text-align:center;direction:ltr;margin:18px 0">${code}</p>
  <p style="color:#777;font-size:13px">ينتهي الرمز خلال 10 دقائق. إن لم تطلبه فتجاهل هذه الرسالة.</p>
</div>`;

// ---------- البريد: Brevo ----------
export async function sendEmailCode({ email, name, code, purpose = 'register' }) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': env('BREVO_API_KEY'), 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: env('BREVO_SENDER_NAME') || 'CWW', email: env('BREVO_SENDER_EMAIL') },
      to: [{ email, name }],
      subject: `${code} هو رمز ${purpose === 'reset' ? 'استعادة كلمة المرور' : 'تأكيد حسابك'} في CWW`,
      htmlContent: emailHtml(name, code, purpose),
      textContent: `رمز التأكيد الخاص بك في CWW: ${code} (صالح 10 دقائق)`,
    }),
  });
  if (!res.ok) {
    console.error('Brevo error:', res.status, await res.text().catch(() => ''));
    throw new AppError('تعذّر إرسال رسالة البريد، حاول لاحقاً', 502);
  }
}

// ---------- الرسائل القصيرة: Twilio Verify (يولّد الرمز ويتحقق منه بنفسه) ----------
const twilioAuth = () => 'Basic ' + Buffer.from(`${env('TWILIO_ACCOUNT_SID')}:${env('TWILIO_AUTH_TOKEN')}`).toString('base64');
const twilioUrl = (path) => `https://verify.twilio.com/v2/Services/${env('TWILIO_VERIFY_SERVICE_SID')}/${path}`;

export async function sendSmsCode(phone) {
  const res = await fetch(twilioUrl('Verifications'), {
    method: 'POST',
    headers: { Authorization: twilioAuth(), 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ To: phone, Channel: 'sms' }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error('Twilio error:', res.status, err);
    // 21608/60410: رقم غير موثّق في حساب التجربة أو محظور
    throw new AppError(
      err.code === 21608 || err.code === 21211
        ? 'هذا الرقم غير مسموح به حالياً (حساب Twilio التجريبي يقبل أرقاماً موثّقة فقط)'
        : 'تعذّر إرسال الرسالة القصيرة',
      502
    );
  }
}

export async function checkSmsCode(phone, code) {
  const res = await fetch(twilioUrl('VerificationCheck'), {
    method: 'POST',
    headers: { Authorization: twilioAuth(), 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ To: phone, Code: String(code) }),
  });
  if (res.status === 404) return false; // انتهت صلاحية الرمز أو اكتملت المحاولات
  if (!res.ok) throw new AppError('تعذّر التحقق من الرمز', 502);
  return (await res.json()).status === 'approved';
}
