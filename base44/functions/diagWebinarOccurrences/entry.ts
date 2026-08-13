// כלי אבחון זמני v2 (13.8) — רשימת תבניות uChat בלבד, קריאה בלבד. לנטרל אחרי שימוש.
const SECRET = 'diag_zx9Qm7';
Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (url.searchParams.get('secret') !== SECRET) return Response.json({ error: 'forbidden' }, { status: 401 });
  const token = Deno.env.get('UCHAT_API_TOKEN');
  if (!token) return Response.json({ error: 'no_uchat_token' }, { status: 500 });
  try { await fetch('https://www.uchat.com.au/api/whatsapp-template/sync', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }); } catch {}
  const r = await fetch('https://www.uchat.com.au/api/whatsapp-template/list', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  const j = await r.json().catch(() => ({}));
  const arr = j?.data || j?.templates || j || [];
  const list = (Array.isArray(arr) ? arr : []).map((t) => ({ name: t?.name || t?.template_name, status: t?.status, lang: t?.language || t?.lang }));
  return Response.json({ count: list.length, templates: list });
});
