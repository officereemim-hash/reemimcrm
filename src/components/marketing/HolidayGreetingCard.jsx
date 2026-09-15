import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import HolidayGreetingForm from '@/components/marketing/HolidayGreetingForm';
import HolidayGreetingConfirmation from '@/components/marketing/HolidayGreetingConfirmation';
export default function HolidayGreetingCard() {
  const [selection, setSelection] = useState({ holiday: 'rosh_hashana', audience: 'all_active' });
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const change = (key, value) => { setSelection(s => ({ ...s, [key]: value })); setPreview(null); setResult(null); setError(''); };
  const run = async (action) => {
    setBusy(true); setError(''); setResult(null);
    try {
      const { data } = await base44.functions.invoke('sendHolidayGreeting', { ...selection, action, preview_token: preview?.preview_token });
      if (data.error) throw new Error(data.error);
      if (action === 'preview') setPreview(data);
      else { setResult(data); setPreview(null); }
    } catch (e) { setError(e?.response?.data?.error || e.message); setPreview(null); }
    finally { setBusy(false); }
  };
  return <Card>
    <CardHeader><CardTitle className="text-base">שליחת ברכת חג</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <HolidayGreetingForm {...selection} onChange={change} onPreview={() => run('preview')} busy={busy} />
      <HolidayGreetingConfirmation preview={preview} busy={busy} onConfirm={() => run('send')} />
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {result && <div role="status" className="text-sm space-y-1"><p>{result.message}</p><p>נמענים: {result.recipients} | מצב: {result.live_mode ? 'שליחה אמיתית' : 'לוג בלבד'}</p></div>}
    </CardContent>
  </Card>;
}