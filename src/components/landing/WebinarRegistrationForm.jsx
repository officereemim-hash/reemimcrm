import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, CheckCircle } from 'lucide-react';

export default function WebinarRegistrationForm({ slug, page }) {
  const [form, setForm] = useState({ full_name: '', phone: '', email: '' });
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  const primary = page.primary_color || '#4B2E83';
  const accent = page.accent_color || '#D4A53C';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.full_name.trim() || !form.phone.trim()) {
      setError('נא למלא שם וטלפון');
      return;
    }
    if (!consent) {
      setError('יש לאשר את תנאי השימוש ומדיניות הפרטיות');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await base44.functions.invoke('registerWebinar', { slug, ...form });
      if (res.data?.ok) {
        setDone(true);
      } else {
        setError('אירעה שגיאה, נסו שוב');
      }
    } catch {
      setError('אירעה שגיאה, נסו שוב');
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="text-center py-6">
        <CheckCircle className="w-14 h-14 mx-auto mb-3" style={{ color: accent }} />
        <h3 className="text-xl font-bold mb-2" style={{ color: primary }}>נרשמת בהצלחה! 🎉</h3>
        <p className="text-gray-600 whitespace-pre-line">
          {page.success_message || 'תודה שנרשמת! הפרטים נקלטו במערכת. תזכורת תישלח אליך בהמשך — שעה לפני ועם תחילת הוובינר.\nשימו לב: לפעמים המייל מגיע לתיבת הספאם, כדאי לבדוק גם שם.'}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <h3 className="text-lg font-bold text-center mb-2" style={{ color: primary }}>
        {page.form_title || 'הרשמה לוובינר'}
      </h3>
      <input
        type="text"
        placeholder="שם מלא"
        value={form.full_name}
        onChange={e => setForm({ ...form, full_name: e.target.value })}
        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2"
        style={{ '--tw-ring-color': primary }}
      />
      <input
        type="tel"
        placeholder="טלפון נייד"
        value={form.phone}
        onChange={e => setForm({ ...form, phone: e.target.value })}
        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2"
        dir="ltr"
      />
      <input
        type="email"
        placeholder="אימייל (אופציונלי)"
        value={form.email}
        onChange={e => setForm({ ...form, email: e.target.value })}
        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2"
        dir="ltr"
      />
      <label className="flex items-start gap-2 text-xs text-gray-600 cursor-pointer leading-relaxed px-1">
        <input
          type="checkbox"
          checked={consent}
          onChange={e => setConsent(e.target.checked)}
          className="mt-0.5 w-4 h-4 flex-shrink-0 cursor-pointer"
          style={{ accentColor: primary }}
        />
        <span>
          {page.consent_text || 'קראתי את תנאי השימוש ומדיניות הפרטיות, ואני מסכים/ה שתיצרו עמי קשר.'}
          {(page.privacy_url || page.accessibility_url) && (
            <span className="block mt-1 space-x-2 space-x-reverse">
              {page.privacy_url && <a href={page.privacy_url} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: primary }}>מדיניות פרטיות</a>}
              {page.accessibility_url && <a href={page.accessibility_url} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: primary }}>הצהרת נגישות</a>}
            </span>
          )}
        </span>
      </label>
      {error && <p className="text-sm text-red-500 text-center">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="w-full py-3 rounded-xl text-white font-semibold transition-opacity hover:opacity-90 flex items-center justify-center gap-2"
        style={{ backgroundColor: accent }}
      >
        {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : (page.form_button_text || 'הרשמה לוובינר')}
      </button>
    </form>
  );
}