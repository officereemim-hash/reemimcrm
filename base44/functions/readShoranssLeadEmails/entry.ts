import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ============================================================
// קורא מייל המשרד (office.reemim) — שורנס + מסמכים מלקוחות
// לא שולח שום הודעת וואטסאפ ללקוח. רק מעדכן כרטיסים, ציר זמן, מסמכים ומשימות.
// דדופ: ישות InboxLog לפי gmail_message_id (בלי תוויות Gmail).
// גוף בקשה אופציונלי: { days: 60, quiet: true } — backfill; quiet = בלי משימות (ולכן בלי מיילים לבשמת).
// ============================================================

function b64(data) {
  let s = String(data || '').replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  try { return atob(s); } catch (e) { return ''; }
}
function b64ToBytes(data) {
  const bin = b64(data);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function toUtf8(s) { try { return decodeURIComponent(escape(s)); } catch { return s; } }
function decodeRfc2047(s) {
  return String(s || '')
    .replace(/=\?UTF-8\?B\?([^?]+)\?=/gi, (_, b) => toUtf8(b64(b)))
    .replace(/=\?UTF-8\?Q\?([^?]+)\?=/gi, (_, q) => toUtf8(q.replace(/_/g, ' ').replace(/=([0-9A-F]{2})/gi, (__, h) => String.fromCharCode(parseInt(h, 16)))));
}

async function gmail(token, path) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Gmail ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

function extractText(payload) {
  let plain = '', html = '';
  const walk = (p) => {
    if (!p) return;
    if (p.mimeType === 'text/plain' && p.body?.data && !p.filename) plain += b64(p.body.data) + '\n';
    if (p.mimeType === 'text/html' && p.body?.data && !p.filename) html += b64(p.body.data) + '\n';
    if (p.parts) p.parts.forEach(walk);
  };
  walk(payload);
  const raw = plain || html.replace(/<[^>]+>/g, ' ');
  return toUtf8(raw).replace(/\s+/g, ' ').trim();
}

function listAttachments(payload) {
  const out = [];
  const walk = (p) => {
    if (!p) return;
    if (p.filename && p.body?.attachmentId) {
      out.push({ filename: decodeRfc2047(p.filename), mimeType: p.mimeType || 'application/octet-stream', size: p.body.size || 0, attachmentId: p.body.attachmentId });
    }
    if (p.parts) p.parts.forEach(walk);
  };
  walk(payload);
  // מסננים תמונות קטנות של חתימות מייל (לוגו, אייקונים)
  return out.filter((a) => {
    const isImg = a.mimeType.startsWith('image/');
    if (isImg && a.size < 20000) return false;
    if (isImg && /logo|icon|youtube|whatsapp|telegram|facebook|instagram|linkedin|signature/i.test(a.filename)) return false;
    return true;
  });
}

function normName(s) {
  return String(s || '').replace(/^(fwd|fw|re|נ|העברה)\s*:\s*/i, '').replace(/["'״׳]/g, '').replace(/\s+/g, ' ').trim();
}
function emailOf(from) {
  const m = String(from || '').match(/<([^>]+)>/);
  return (m ? m[1] : String(from || '')).trim().toLowerCase();
}
function displayNameOf(from) {
  const m = String(from || '').match(/^\s*"?([^"<]*?)"?\s*</);
  return decodeRfc2047(m ? m[1] : '').trim();
}

// שולחים מערכתיים — לא מסמכים של לקוחות
const SYSTEM_SENDER = /(surense\.com|base44|brevo|stripe\.com|uchat\.com\.au|cal\.com|cal\.eu|google\.com|green-api|zoom\.us|facebookmail|meta\.com|mailer-daemon|noreply|no-reply|no_reply|office\.reemim@gmail\.com)/i;
// שולחים פנימיים (בשמת שמעבירה מייל) — לא פותחים להם כרטיס, רק משימה לשיוך ידני
const INTERNAL_SENDER = /(bosmat@oryx-alt\.com|office\.reemim@gmail\.com)/i;

function guessCategory(filename) {
  const f = String(filename || '');
  if (/ת["״]?ז|תעודת.?זהות|ספח|teudat|id[\s_-]?card/i.test(f)) return 'identity';
  if (/תלוש|שכר|salary|payslip/i.test(f)) return 'salary';
  if (/106|מס|שומה|tax/i.test(f)) return 'tax';
  if (/פנסיה|גמל|קרן|ביטוח|דוח.?שנתי/i.test(f)) return 'pension_fund';
  return 'other';
}

// מיפוי סטטוס שורנס ← סטטוס ראשי (רק במקרים חד-משמעיים)
function mainStatusFor(shoranssStatus, current) {
  const s = String(shoranssStatus || '');
  if (/נסגרה מכירה|הפך ללקוח פעיל/.test(s)) {
    return ['completed', 'archived', 'active_client'].includes(current) ? null : 'active_client';
  }
  if (/לא נסגר|לקוח של סוכן אחר/.test(s)) {
    // לא מורידים לקוח קיים ל"לא רלוונטי"
    return ['new_lead', 'in_progress', 'quote_sent'].includes(current) ? 'not_relevant' : null;
  }
  return null;
}

function classifySurense(text) {
  if (/מסלקה/.test(text)) return { kind: 'skip_maslaka' };
  if (/נוצר ליד חדש/.test(text)) return { kind: 'lead_created', label: 'ליד חדש בשורנס' };
  let m = text.match(/שינה\/תה סטטוס ליד ל:\s*(.+?)\s+(?:צפיה|צפייה|ניתן להשיב)/);
  if (m) return { kind: 'status', label: m[1].trim() };
  m = text.match(/שינה\/תה מטפל ליד ל:\s*(.+?)\s+(?:צפיה|צפייה|ניתן להשיב)/);
  if (m) return { kind: 'handler', label: `מטפל: ${m[1].trim()}` };
  m = text.match(/תאריך טיפול נדרש ליד ל\s*([0-9/]+)/);
  if (m) return { kind: 'due_date', label: `תאריך טיפול: ${m[1]}` };
  if (/סיכום פגישה נצפה על ידי הלקוח/.test(text)) return { kind: 'summary_viewed', label: 'הלקוח צפה בסיכום הפגישה' };
  if (/דוח נצפה על ידי הלקוח/.test(text)) return { kind: 'report_viewed', label: 'הלקוח צפה בדוח' };
  if (/נוצר תהליך חדש/.test(text)) return { kind: 'process_created', label: 'נפתח תהליך בשורנס' };
  return { kind: 'skip_surense_other' };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const days = Math.min(Math.max(Number(body.days) || 2, 1), 90);
    const quiet = body.quiet === true;
    const db = base44.asServiceRole.entities;

    const { accessToken: token } = await base44.asServiceRole.connectors.getConnection('gmail');

    // --- רשימת הודעות (עם דפדוף) ---
    const q = encodeURIComponent(`newer_than:${days}d -in:sent -in:chats -in:drafts`);
    let ids = [], pageToken = '';
    do {
      const list = await gmail(token, `messages?q=${q}&maxResults=100${pageToken ? `&pageToken=${pageToken}` : ''}`);
      ids.push(...(list.messages || []).map((m) => m.id));
      pageToken = list.nextPageToken || '';
    } while (pageToken && ids.length < 1000);
    ids = ids.reverse(); // מהישן לחדש — הסטטוס האחרון הוא שנשאר

    const ignoredSetting = await db.SystemSetting.filter({ key: 'ignored_shoranss_lead_ids' });
    const ignoredIds = new Set((ignoredSetting[0]?.value || '').split(',').filter(Boolean));

    const stats = { scanned: ids.length, already: 0, lead_created: 0, lead_linked: 0, surense_update: 0, unmatched_surense: 0, documents: 0, unmatched_documents: 0, new_contacts: 0, skipped: 0, errors: 0 };

    async function findByName(name) {
      if (!name || name.length < 3) return [];
      return await db.Contact.filter({ full_name: name });
    }
    async function openRequest(contactId) {
      const srs = await db.ServiceRequest.filter({ contact_id: contactId }, '-updated_date', 10);
      return srs.find((r) => !['completed', 'cancelled', 'closed_lost', 'followup_closed'].includes(r.status)) || null;
    }
    async function note(contactId, content, templateId) {
      await db.Communication.create({ contact_id: contactId, type: 'note', direction: 'inbound', sent_by: 'system', is_automated: true, status: 'sent', template_id: templateId, content });
    }
    async function log(id, kind, contactId, summary) {
      await db.InboxLog.create({ gmail_message_id: id, kind, contact_id: contactId || '', summary: String(summary || '').slice(0, 500) });
    }

    for (const id of ids) {
      try {
        const done = await db.InboxLog.filter({ gmail_message_id: id });
        if (done.length) { stats.already++; continue; }

        const msg = await gmail(token, `messages/${id}?format=full`);
        const headers = Object.fromEntries((msg.payload?.headers || []).map((h) => [h.name.toLowerCase(), h.value]));
        const from = headers['from'] || '';
        const fromEmail = emailOf(from);
        const subject = decodeRfc2047(headers['subject'] || '');
        const mailDate = msg.internalDate ? new Date(Number(msg.internalDate)).toISOString() : new Date().toISOString();
        const text = extractText(msg.payload);
        const isSurense = /surense\.com/i.test(fromEmail) || (/bosmat@oryx-alt\.com/i.test(fromEmail) && /app\.surense\.com/.test(text));

        // ================= שורנס =================
        if (isSurense) {
          if (!/notifications@app\.surense\.com/i.test(fromEmail) && !/bosmat@oryx-alt\.com/i.test(fromEmail)) {
            await log(id, 'skip_surense_digest', '', subject); stats.skipped++; continue;
          }
          // השם מופיע בגוף ההודעה פעמיים — מסירים אותו כדי לחלץ את הסטטוס נקי
          const cleanText = subject.trim() ? text.split(subject.trim()).join(' ').replace(/\s+/g, ' ') : text;
          const c = classifySurense(cleanText);
          if (c.kind.startsWith('skip')) { await log(id, c.kind, '', subject); stats.skipped++; continue; }

          const name = normName(subject);
          const leadId = (text.match(/app\.surense\.com\/leads\?id=([0-9a-fA-F-]{36})/) || [])[1] || '';
          const customerId = (text.match(/app\.surense\.com\/customers\/([0-9a-fA-F-]{36})/) || [])[1] || '';
          const surenseUrl = leadId ? `https://app.surense.com/leads?id=${leadId}` : (customerId ? `https://app.surense.com/customers/${customerId}` : '');

          // איתור הכרטיס: מזהה ליד ← מזהה לקוח בשורנס ← שם
          let contact = null;
          if (leadId) contact = (await db.Contact.filter({ shoranss_lead_id: leadId }))[0] || null;
          if (!contact && customerId) contact = (await db.Contact.filter({ shoranss_customer_id: customerId }))[0] || null;
          if (!contact) {
            let byName = await findByName(name);
            if (byName.length > 1) byName = byName.filter((x) => x.shoranss_questionnaire === 'sent' || x.shoranss_lead_id);
            if (byName.length === 1) contact = byName[0];
          }

          if (c.kind === 'lead_created') {
            if (leadId && ignoredIds.has(leadId)) { await log(id, 'skip_ignored_lead', '', name); stats.skipped++; continue; }
            if (contact) {
              await db.Contact.update(contact.id, {
                shoranss_questionnaire: 'filled', shoranss_linked: true,
                shoranss_status: c.label, shoranss_status_at: mailDate,
                ...(leadId ? { shoranss_lead_id: leadId, shoranss_lead_url: surenseUrl } : {}),
              });
              await note(contact.id, `שורנס: נוצר ליד (השאלון מולא). ${surenseUrl}`, 'shoranss_lead_created');
              await log(id, 'lead_linked', contact.id, name); stats.lead_linked++;
            } else {
              // ליד שהגיע ישירות משורנס — נפתח כרטיס, בלי שום הודעה ללקוח (החלטת בשמת)
              const created = await db.Contact.create({
                full_name: name, status: 'new_lead', source: 'shoranss',
                shoranss_questionnaire: 'filled', shoranss_linked: true,
                shoranss_status: c.label, shoranss_status_at: mailDate,
                ...(leadId ? { shoranss_lead_id: leadId, shoranss_lead_url: surenseUrl } : {}),
              });
              await note(created.id, `נפתח כרטיס מהתראת שורנס (השאלון מולא). לא נשלחת הודעה עד קביעת פגישה בקאלקום. ${surenseUrl}`, 'shoranss_lead_created');
              await log(id, 'lead_created', created.id, name); stats.lead_created++;
            }
            continue;
          }

          // כל שאר עדכוני שורנס
          if (!contact) { await log(id, 'unmatched_surense', '', `${name} | ${c.label}`); stats.unmatched_surense++; continue; }
          const upd = { shoranss_status: c.label, shoranss_status_at: mailDate, shoranss_linked: true };
          if (customerId && !contact.shoranss_customer_id) upd.shoranss_customer_id = customerId;
          if (leadId && !contact.shoranss_lead_id) { upd.shoranss_lead_id = leadId; upd.shoranss_lead_url = surenseUrl; }
          if (c.kind === 'status') {
            const newMain = mainStatusFor(c.label, contact.status);
            if (newMain) upd.status = newMain;
          }
          await db.Contact.update(contact.id, upd);
          await note(contact.id, `שורנס: ${c.label}${upd.status ? ` (הסטטוס במערכת עודכן)` : ''}. ${surenseUrl}`, `shoranss_${c.kind}`);
          await log(id, `surense_${c.kind}`, contact.id, `${name} | ${c.label}`); stats.surense_update++;
          continue;
        }

        // ================= מסמכים מלקוחות =================
        if (SYSTEM_SENDER.test(fromEmail)) { await log(id, 'skip_system', '', fromEmail); stats.skipped++; continue; }
        const atts = listAttachments(msg.payload);
        if (!atts.length) { await log(id, 'skip_no_attachment', '', fromEmail); stats.skipped++; continue; }

        // העלאת הקבצים לאחסון
        const uploaded = [];
        for (const a of atts) {
          const data = await gmail(token, `messages/${id}/attachments/${a.attachmentId}`);
          const file = new File([b64ToBytes(data.data)], a.filename || 'document', { type: a.mimeType });
          const up = await base44.asServiceRole.integrations.Core.UploadPrivateFile({ file });
          uploaded.push({ ...a, file_uri: up.file_uri });
        }

        const fileList = uploaded.map((u) => `• ${u.filename}`).join('\n');

        // איתור הכרטיס: מייל השולח ← שם השולח (התאמה יחידה) ← כרטיס חדש
        const matches = await db.Contact.filter({ email: fromEmail });
        let contact = matches.length === 1 ? matches[0] : null;
        let createdNew = false;
        if (!contact && matches.length === 0 && !INTERNAL_SENDER.test(fromEmail)) {
          const senderName = normName(displayNameOf(from));
          const byName = await findByName(senderName);
          if (byName.length === 1) {
            contact = byName[0];
            if (!contact.email) await db.Contact.update(contact.id, { email: fromEmail });
          } else if (!byName.length) {
            // שולח שלא קיים במערכת — נפתח כרטיס חדש, בלי שום הודעה ללקוח
            contact = await db.Contact.create({
              full_name: senderName || fromEmail.split('@')[0], email: fromEmail,
              status: 'in_progress', source: 'email',
            });
            createdNew = true;
            await note(contact.id, `נפתח כרטיס אוטומטית: התקבלו מסמכים במייל משולח שלא היה במערכת (${fromEmail}). לבדוק את השם ולהשלים טלפון.`, 'email_sender_contact_created');
            stats.new_contacts++;
          }
        }

        if (contact) {
          const sr = await openRequest(contact.id);
          for (const u of uploaded) {
            await db.Document.create({
              contact_id: contact.id, service_request_id: sr?.id || '', name: u.filename,
              category: guessCategory(u.filename), file_uri: u.file_uri,
              uploaded_by: `email:${fromEmail}`, gmail_message_id: id,
            });
          }
          // סטטוס מסמכים בכרטיס — כדי שבשמת תראה מי קיבל מסמכים חדשים
          if (contact.documents_review !== 'to_review') await db.Contact.update(contact.id, { documents_review: 'to_review' });
          const srUpd = {};
          if (sr && sr.documents_status !== 'complete') srUpd.documents_status = 'partial';
          // אישור אוטומטי ללקוח (נשלח מ-autoServiceRequestUpdated): רק על מייל חדש, לא בריצת השלמה שקטה
          const recentMail = Date.now() - new Date(mailDate).getTime() < 48 * 60 * 60 * 1000;
          if (sr && !sr.documents_arrived_at && !quiet && recentMail) srUpd.documents_arrived_at = mailDate;
          if (sr && Object.keys(srUpd).length) await db.ServiceRequest.update(sr.id, srUpd);
          await note(contact.id, `התקבלו במייל ${uploaded.length} מסמכים:\n${fileList}`, 'email_documents_received');
          if (!quiet) {
            await db.Task.create({
              title: createdNew
                ? `כרטיס חדש ממייל עם מסמכים — ${contact.full_name} (${uploaded.length})`
                : `התקבל מסמך במייל — ${contact.full_name || fromEmail} (${uploaded.length})`,
              type: 'document_collection', status: 'open', priority: 'normal', auto_generated: true,
              assigned_to: 'basmat', contact_id: contact.id, service_request_id: sr?.id || '',
              notes: `${createdNew ? 'הכרטיס נפתח אוטומטית. לבדוק את השם ולהשלים טלפון.\n' : ''}לבדוק את המסמכים ולסמן "מסמכים התקבלו" רק כשהכל הגיע.\nנושא המייל: ${subject}\n${fileList}`,
            });
          }
          await log(id, createdNew ? 'documents_new_contact' : 'documents', contact.id, `${fromEmail} | ${uploaded.length}`); stats.documents++;
        } else {
          if (!quiet) {
            await db.Task.create({
              title: `מסמך במייל — לשייך ידנית — ${from}`,
              type: 'document_collection', status: 'open', priority: 'normal', auto_generated: true,
              assigned_to: 'basmat',
              notes: `${INTERNAL_SENDER.test(fromEmail) ? 'המייל הועבר מכתובת פנימית' : 'נמצאו כמה כרטיסים מתאימים'} (${fromEmail}). לשייך ידנית לכרטיס הנכון.\nנושא המייל: ${subject}\n${fileList}`,
            });
          }
          await log(id, 'unmatched_documents', '', `${fromEmail} | ${fileList}`); stats.unmatched_documents++;
        }
      } catch (e) {
        stats.errors++;
        console.error('office inbox message failed', id, e.message);
        // לא כותבים InboxLog — ננסה שוב בריצה הבאה
      }
    }

    return Response.json({ ok: true, days, quiet, ...stats });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});