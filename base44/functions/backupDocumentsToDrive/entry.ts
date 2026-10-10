import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ============================================================
// גיבוי מסמכי לקוחות לגוגל דרייב של המשרד (office.reemim), פעם בלילה.
// הקונקטור googledrive עם הרשאת drive.file: המערכת רואה בדרייב רק קבצים שהיא עצמה יצרה.
// מבנה: "ראמים — גיבוי מסמכי לקוחות" / "<שם הלקוח> (<4 תווים אחרונים של המזהה>)" / "<תאריך> — <שם הקובץ>"
// תיקיות וקבצים מזוהים לפי appProperties (לא לפי שם): שינוי שם בכרטיס לא יוצר תיקייה כפולה,
// וריצה שנקטעה אחרי העלאה לא מעלה את אותו קובץ פעמיים.
// מסמך שגובה מקבל drive_file_id ולא מגובה שוב. מסמך שנחתם אחרי הגיבוי: ה-PDF החתום ותמונת החתימה מתווספים בריצה הבאה.
// מסמך שנמחק במערכת נשאר בדרייב (זה הגיבוי). בלי שיתוף ובלי קישורים פתוחים.
// כשל: נרשם על המסמך. אחרי 3 ניסיונות המסמך לא ננסה שוב. בסוף ריצה עם כשלים: מייל אחד לבשמת.
// ============================================================

const ROOT_NAME = 'ראמים — גיבוי מסמכי לקוחות';
const NO_CONTACT_NAME = 'מסמכים בלי כרטיס';
const MAX_PER_RUN = 25;
const TIME_BUDGET_MS = 4 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const LOCK_KEY = 'drive_backup_running_since';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

function parseDate(d) {
  const s = String(d || '');
  return new Date(/Z$|[+-]\d\d:?\d\d$/.test(s) ? s : s + 'Z');
}
function ilDate(d) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(parseDate(d)); // YYYY-MM-DD
}
function safeName(s) {
  return String(s || '').replace(/[\\/]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 150);
}
function extOf(uriOrUrl) {
  const m = String(uriOrUrl || '').split('?')[0].match(/\.([A-Za-z0-9]{1,5})$/);
  return m ? m[1].toLowerCase() : '';
}
function esc(s) {
  return String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

async function drive(token, path, init = {}) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) },
  });
  if (!res.ok) throw new Error(`Drive ${path.split('?')[0]}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function findByProp(token, prop, value, folderOnly = false) {
  const q = encodeURIComponent(`trashed=false${folderOnly ? ` and mimeType='${FOLDER_MIME}'` : ''} and appProperties has { key='${prop}' and value='${value}' }`);
  const r = await drive(token, `files?q=${q}&fields=files(id)&pageSize=1&spaces=drive`);
  return r.files?.[0]?.id || '';
}

async function ensureFolder(token, { name, parentId, prop, value }) {
  const found = await findByProp(token, prop, value, true);
  if (found) return found;
  const created = await drive(token, 'files?fields=id', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, ...(parentId ? { parents: [parentId] } : {}), appProperties: { [prop]: value } }),
  });
  return created.id;
}

// העלאה ב-resumable: עובד לכל גודל קובץ
async function uploadFile(token, { name, parentId, bytes, mimeType, appProperties }) {
  const init = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': mimeType,
      'X-Upload-Content-Length': String(bytes.byteLength),
    },
    body: JSON.stringify({ name, parents: [parentId], appProperties }),
  });
  if (!init.ok) throw new Error(`Drive upload init: ${init.status} ${(await init.text()).slice(0, 200)}`);
  const location = init.headers.get('location');
  if (!location) throw new Error('Drive upload init: no location');
  const put = await fetch(location, { method: 'PUT', headers: { 'Content-Type': mimeType }, body: bytes });
  if (!put.ok) throw new Error(`Drive upload: ${put.status} ${(await put.text()).slice(0, 200)}`);
  return (await put.json()).id;
}

async function download(base44, url, fileUri) {
  let target = url;
  if (fileUri) {
    const { signed_url } = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({ file_uri: fileUri, expires_in: 300 });
    target = signed_url;
  }
  if (!target) throw new Error('אין קובץ למסמך');
  const res = await fetch(target);
  if (!res.ok) throw new Error(`הורדת הקובץ נכשלה: ${res.status}`);
  return {
    bytes: new Uint8Array(await res.arrayBuffer()),
    mimeType: (res.headers.get('content-type') || 'application/octet-stream').split(';')[0],
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // אוטומציה רצה בלי משתמש. משתמש מחובר שאינו admin לא מפעיל.
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    const db = base44.asServiceRole.entities;
    const started = Date.now();

    // נעילה: שתי ריצות לא רצות במקביל. נעילה ישנה (ריצה שנקטעה) פגה אחרי 10 דקות.
    const lockRows = await db.SystemSetting.filter({ key: LOCK_KEY });
    const lockAt = lockRows[0]?.value ? parseDate(lockRows[0].value).getTime() : 0;
    if (lockAt && Date.now() - lockAt < 10 * 60 * 1000) return Response.json({ ok: true, skipped: 'already_running' });
    const lockRow = lockRows[0]
      ? await db.SystemSetting.update(lockRows[0].id, { value: new Date().toISOString() }).then(() => lockRows[0])
      : await db.SystemSetting.create({ key: LOCK_KEY, value: new Date().toISOString(), category: 'flow' });

    const stats = { backed_up: 0, signatures: 0, failed: 0, not_reached: 0 };
    const failures = [];
    try {
      const docs = (await db.Document.list('created_date', 5000))
        .filter((d) => (d.file_uri || d.file_url) && (d.drive_backup_attempts || 0) < MAX_ATTEMPTS)
        .filter((d) => !d.drive_file_id || (d.signature_data && !d.drive_signature_file_id));
      if (!docs.length) return Response.json({ ok: true, ...stats });

      const { accessToken: token } = await base44.asServiceRole.connectors.getConnection('googledrive');
      const rootId = await ensureFolder(token, { name: ROOT_NAME, prop: 'reemim_backup', value: 'root' });

      const folders = new Map();
      const names = new Map();
      async function folderFor(contactId) {
        const key = contactId || 'none';
        if (folders.has(key)) return folders.get(key);
        let name = NO_CONTACT_NAME;
        if (contactId) {
          const c = (await db.Contact.filter({ id: contactId }))[0];
          names.set(contactId, c?.full_name || '');
          name = `${safeName(c?.full_name) || 'ללא שם'} (${contactId.slice(-4)})`;
        }
        const id = await ensureFolder(token, { name, parentId: rootId, prop: 'reemim_contact_id', value: key });
        folders.set(key, id);
        return id;
      }

      let done = 0;
      for (const doc of docs) {
        if (done >= MAX_PER_RUN || Date.now() - started > TIME_BUDGET_MS) break;
        done++;
        try {
          const folderId = await folderFor(doc.contact_id);
          const base = `${ilDate(doc.created_date)} — ${safeName(doc.name) || 'מסמך'}`;
          const upd = { drive_backup_error: '', drive_backup_attempts: 0 };

          if (!doc.drive_file_id) {
            let fileId = await findByProp(token, 'reemim_document_id', doc.id);
            if (!fileId) {
              const { bytes, mimeType } = await download(base44, doc.file_url, doc.file_uri);
              const ext = extOf(doc.file_uri || doc.file_url);
              const name = ext && !base.toLowerCase().endsWith(`.${ext}`) ? `${base}.${ext}` : base;
              fileId = await uploadFile(token, { name, parentId: folderId, bytes, mimeType, appProperties: { reemim_document_id: doc.id } });
            }
            upd.drive_file_id = fileId;
            stats.backed_up++;
          }

          // מסמך חתום: תמונת החתימה, ואם הגיבוי הקודם היה לפני החתימה — גם ה-PDF החתום.
          // submitSignature שומר את ה-PDF החתום במקום הקובץ המקורי (file_url). אם הקובץ הראשי עלה
          // בריצה הזו (בלי drive_file_id מריצה קודמת), הוא כבר הגרסה החתומה, ואין צורך בעותק נוסף.
          if (doc.signature_data && !doc.drive_signature_file_id) {
            const plain = base.replace(/\.[A-Za-z0-9]{1,5}$/, '');
            if (doc.drive_file_id) {
              const signedId = await findByProp(token, 'reemim_signed_of', doc.id);
              if (!signedId) {
                const { bytes, mimeType } = await download(base44, doc.file_url, doc.file_uri);
                const ext = extOf(doc.file_uri || doc.file_url) || 'pdf';
                await uploadFile(token, { name: `${plain} — חתום.${ext}`, parentId: folderId, bytes, mimeType, appProperties: { reemim_signed_of: doc.id } });
              }
            }
            let sigId = await findByProp(token, 'reemim_signature_of', doc.id);
            if (!sigId) {
              const { bytes, mimeType } = await download(base44, doc.signature_data, '');
              const ext = extOf(doc.signature_data) || 'png';
              sigId = await uploadFile(token, { name: `${plain} — חתימה.${ext}`, parentId: folderId, bytes, mimeType, appProperties: { reemim_signature_of: doc.id } });
            }
            upd.drive_signature_file_id = sigId;
            stats.signatures++;
          }

          upd.drive_backed_up_at = new Date().toISOString();
          await db.Document.update(doc.id, upd);
        } catch (e) {
          stats.failed++;
          const attempts = (doc.drive_backup_attempts || 0) + 1;
          failures.push({ doc, error: String(e.message || e), final: attempts >= MAX_ATTEMPTS });
          try {
            await db.Document.update(doc.id, { drive_backup_error: String(e.message || e).slice(0, 300), drive_backup_attempts: attempts });
          } catch (_) { /* לא לעצור את שאר המסמכים */ }
        }
      }
      stats.not_reached = Math.max(docs.length - done, 0);

      // מייל אחד לבשמת אם היו כשלים בריצה הזו
      if (failures.length) {
        const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY') || '';
        const sender = (await db.SystemSetting.filter({ key: 'mailing_sender_email' }))[0]?.value || '';
        if (BREVO_API_KEY && sender) {
          const rows = failures.map((f) => {
            const who = names.get(f.doc.contact_id) || '';
            return `<li>${esc(f.doc.name || 'מסמך')}${who ? ` (${esc(who)})` : ''}${f.final ? ' — לא ננסה שוב' : ''}<br/><small>${esc(f.error)}</small></li>`;
          }).join('');
          const html = `<div dir="rtl" style="font-family:Arial;font-size:16px;line-height:1.6">
בגיבוי הלילי לדרייב של המשרד חלק מהמסמכים לא גובו.<br/>
המסמכים עצמם שמורים במערכת כרגיל, ושום דבר לא נמחק.<br/><br/>
<ul>${rows}</ul>
מסמך שלא גובה ננסה לגבות שוב בלילה הבא, עד 3 פעמים.<br/>
אם המייל הזה חוזר, להעביר אותו לעינת.
</div>`;
          await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sender: { name: 'קרנות ראמים — מערכת', email: sender },
              to: [{ email: 'bosmat@oryx-alt.com', name: 'בשמת' }],
              subject: `⚠️ גיבוי המסמכים לדרייב: ${failures.length} מסמכים לא גובו`,
              htmlContent: html,
            }),
          }).catch((e) => console.error('backup alert email failed:', e.message));
        }
      }

      return Response.json({ ok: true, ...stats, failures: failures.map((f) => ({ id: f.doc.id, error: f.error })) });
    } finally {
      try { await db.SystemSetting.update(lockRow.id, { value: '' }); } catch (_) {}
    }
  } catch (error) {
    console.error('backupDocumentsToDrive:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});