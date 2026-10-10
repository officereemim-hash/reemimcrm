// מודול משותף לשליחת תבניות WhatsApp דרך uChat.
// חשוב: uChat מפרש שליחה דרך API כמענה נציג ומשהה את האוטומציה של המנוי (Pause Automation).
// לכן אחרי כל שליחת תבנית מוצלחת קוראים resume-bot — אחרת לחיצה על כפתור בתבנית
// לא מפעילה Flow ולא מגיעה ל-webhook שלנו (התקלה מ-16.8).

const UCHAT_TOKEN = Deno.env.get('UCHAT_API_TOKEN');
const UCHAT_BASE = 'https://www.uchat.com.au/api';

export function toIntlPhone(phone: string) {
  let p = String(phone || '').replace(/[\s\-\+\(\)]/g, '');
  if (p.startsWith('0')) p = '972' + p.substring(1);
  return p;
}

async function templateNamespace(templateName: string) {
  const listOnce = async () => {
    try {
      const r = await fetch(`${UCHAT_BASE}/whatsapp-template/list`, { method: 'POST', headers: { Authorization: `Bearer ${UCHAT_TOKEN}` } });
      if (!r.ok) return null;
      const j = await r.json();
      const arr = j?.data || j?.templates || j || [];
      const t = (Array.isArray(arr) ? arr : []).find((x: any) => x?.name === templateName || x?.template_name === templateName);
      return t?.namespace || null;
    } catch { return null; }
  };
  let ns = await listOnce();
  if (!ns) {
    try { await fetch(`${UCHAT_BASE}/whatsapp-template/sync`, { method: 'POST', headers: { Authorization: `Bearer ${UCHAT_TOKEN}` } }); } catch {}
    ns = await listOnce();
  }
  return ns;
}

async function resolveUserNs(phone972: string) {
  try {
    const r = await fetch(`${UCHAT_BASE}/subscriber/get-info-by-user-id?user_id=${phone972}`, { headers: { Authorization: `Bearer ${UCHAT_TOKEN}` } });
    if (!r.ok) return null;
    const j = await r.json();
    return j?.user_ns || j?.data?.user_ns || null;
  } catch { return null; }
}

// ביטול Pause Automation אחרי שליחה דרך ה-API
async function resumeBot(phone972: string) {
  const ns = await resolveUserNs(phone972);
  if (!ns) { console.log(`uchat resume: no subscriber for ${phone972}`); return; }
  try {
    const r = await fetch(`${UCHAT_BASE}/subscriber/resume-bot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${UCHAT_TOKEN}` },
      body: JSON.stringify({ user_ns: ns }),
    });
    if (!r.ok) console.error('uchat resume-bot http', r.status, await r.text().catch(() => ''));
  } catch (e) { console.error('uchat resume-bot failed:', (e as Error).message); }
}

export async function getUchatTemplateName(base44: any, key: string) {
  const r = await base44.asServiceRole.entities.SystemSetting.filter({ key: `uchat_tpl_${key}` });
  return r[0]?.value || '';
}

// הערה או שגיאה מהשליחה האחרונה, כדי שתירשם בתור הדיוור ולא רק בלוג
export let lastUchatNote = '';

async function postTemplate(phone972: string, firstName: string, namespace: string, templateName: string, params: Record<string, string>) {
  const res = await fetch(`${UCHAT_BASE}/subscriber/send-whatsapp-template-by-user-id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${UCHAT_TOKEN}` },
    body: JSON.stringify({ user_id: phone972, create_if_not_found: 'yes', contact: { first_name: firstName || '' }, content: { namespace, name: templateName, lang: 'he', params } }),
  });
  const text = await res.text().catch(() => '');
  let j: any = {};
  try { j = JSON.parse(text); } catch (_) { /* תשובה שאינה JSON */ }
  return { ok: res.ok, status: res.status, j, text };
}

export async function uchatSendTemplate(phone972: string, firstName: string, templateName: string, bodyParams: any[], base44?: any) {
  lastUchatNote = '';
  const namespace = await templateNamespace(templateName);
  if (!namespace) {
    lastUchatNote = `התבנית ${templateName} לא נמצאה ב-uChat`;
    console.error(`uchat: template '${templateName}' not found/synced`);
    return null;
  }
  const params: Record<string, string> = {};
  (bodyParams || []).forEach((v, i) => { params[`BODY_{{${i + 1}}}`] = String(v ?? ''); });
  let image = '';
  try {
    if (base44) {
      const imgSetting = await base44.asServiceRole.entities.SystemSetting.filter({ key: `uchat_tpl_img_${templateName}` });
      image = imgSetting[0]?.value || '';
    }
  } catch (_) { /* בלי תמונה — שולחים כרגיל */ }
  if (image) params['HEADER_IMAGE'] = image;

  let r = await postTemplate(phone972, firstName, namespace, templateName, params);
  // רשת ביטחון לתמונה: uChat דחה שליחה עם תמונה → ניסיון אחד נוסף, אותה תבנית בלי התמונה.
  // רק כשברור שלא נשלח כלום (שגיאת HTTP או status שאינו ok). ok בלי mid לא נשלח שוב, כדי לא ליצור כפילות.
  if (image && (!r.ok || r.j?.status !== 'ok')) {
    const first = `${r.status} ${r.text.slice(0, 200)}`;
    console.error('uchat template with HEADER_IMAGE rejected, retrying without image:', first);
    delete params['HEADER_IMAGE'];
    r = await postTemplate(phone972, firstName, namespace, templateName, params);
    lastUchatNote = (r.ok && r.j?.status === 'ok')
      ? `נשלח בלי תמונה: uChat דחה את התמונה (${first})`
      : `uChat דחה עם תמונה (${first}) וגם בלי תמונה (${r.status} ${r.text.slice(0, 200)})`;
  }
  if (!r.ok) {
    if (!lastUchatNote) lastUchatNote = `uChat ${r.status}: ${r.text.slice(0, 300)}`;
    console.error('uchat template http', r.status, r.text);
    return null;
  }
  const mid = r.j?.mid || r.j?.data?.mid || null;
  if (r.j?.status === 'ok' && mid) {
    await resumeBot(phone972); // בלי זה הכפתור בתבנית לא מפעיל Flow
    return { ...r.j, mid };
  }
  if (!lastUchatNote) lastUchatNote = `uChat: ${r.text.slice(0, 300)}`;
  console.error('uchat template not ok:', r.text);
  return null;
}

export async function uchatSend(base44: any, phone: string, tplKey: string, firstName: string, params?: any[]) {
  const p = toIntlPhone(phone);
  const tplName = await getUchatTemplateName(base44, tplKey);
  if (!tplName) { console.log(`uchat: שם תבנית ל-'${tplKey}' לא מוגדר (uchat_tpl_${tplKey})`); return false; }
  return !!(await uchatSendTemplate(p, firstName, tplName, params || [], base44));
}