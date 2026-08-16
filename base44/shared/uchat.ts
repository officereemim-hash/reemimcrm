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

export async function uchatSendTemplate(phone972: string, firstName: string, templateName: string, bodyParams: any[]) {
  const namespace = await templateNamespace(templateName);
  if (!namespace) { console.error(`uchat: template '${templateName}' not found/synced`); return null; }
  const params: Record<string, string> = {};
  (bodyParams || []).forEach((v, i) => { params[`BODY_{{${i + 1}}}`] = String(v ?? ''); });
  const res = await fetch(`${UCHAT_BASE}/subscriber/send-whatsapp-template-by-user-id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${UCHAT_TOKEN}` },
    body: JSON.stringify({ user_id: phone972, create_if_not_found: 'yes', contact: { first_name: firstName || '' }, content: { namespace, name: templateName, lang: 'he', params } }),
  });
  if (!res.ok) { console.error('uchat template http', res.status, await res.text().catch(() => '')); return null; }
  const j = await res.json().catch(() => ({}));
  const mid = j?.mid || j?.data?.mid || null;
  if (j?.status === 'ok' && mid) {
    await resumeBot(phone972); // בלי זה הכפתור בתבנית לא מפעיל Flow
    return { ...j, mid };
  }
  console.error('uchat template not ok:', JSON.stringify(j));
  return null;
}

export async function uchatSend(base44: any, phone: string, tplKey: string, firstName: string, params?: any[]) {
  const p = toIntlPhone(phone);
  const tplName = await getUchatTemplateName(base44, tplKey);
  if (!tplName) { console.log(`uchat: שם תבנית ל-'${tplKey}' לא מוגדר (uchat_tpl_${tplKey})`); return false; }
  return !!(await uchatSendTemplate(p, firstName, tplName, params || []));
}