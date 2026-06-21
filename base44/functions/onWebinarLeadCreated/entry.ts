import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const INSTANCE_ID = Deno.env.get('GREEN_API_INSTANCE_ID');
const API_TOKEN = Deno.env.get('GREEN_API_TOKEN');

function toChatId(localPhone) {
  let clean = String(localPhone || '').replace(/[^\d]/g, '');
  if (clean.startsWith('0')) clean = '972' + clean.substring(1);
  return `${clean}@c.us`;
}

function fillTemplate(template, values) {
  return String(template || '')
    .replaceAll('{name}', values.name || '')
    .replaceAll('{landing_link}', values.landing_link || '');
}

const TYPE_LABELS = { investments: 'השקעות', divorce: 'גירושין / איזון', retirement: 'פרישה' };

// Automation (WebinarRegistration create): sends the first WhatsApp message to a Meta lead
// with a link to the landing page. If webinar type is unclear, sends a clarification first.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const reg = body.data || body.record || body;

    if (!reg?.id || !reg?.contact_id) {
      return Response.json({ ok: true, skipped: 'no_record' });
    }

    // רק לידים שמקורם במטא (סנכרון מגוגל שיטס) — לא למי שמילא דף נחיתה (registerWebinar)
    // מי שנרשם דרך דף הנחיתה כבר קיבל webinar_confirm, אז מדלגים אם כבר נשלח קישור
    const contacts = await base44.asServiceRole.entities.Contact.filter({ id: reg.contact_id }).catch(() => []);
    const contact = contacts[0];
    if (!contact?.phone) {
      return Response.json({ ok: true, skipped: 'no_phone' });
    }

    // אם כבר קיים תיעוד של אישור הרשמה (webinar_confirm) — הליד הגיע מדף נחיתה, לא ממטא
    const existingConfirm = await base44.asServiceRole.entities.Communication.filter(
      { contact_id: reg.contact_id, template_id: 'webinar_confirm' }, '-created_date', 1
    );
    if (existingConfirm.length > 0) {
      return Response.json({ ok: true, skipped: 'already_registered_via_landing' });
    }
    // אם כבר שלחנו את הודעת הפתיחה — לא לשלוח שוב
    const existingIntro = await base44.asServiceRole.entities.Communication.filter(
      { contact_id: reg.contact_id, template_id: 'webinar_lead_intro' }, '-created_date', 1
    );
    if (existingIntro.length > 0) {
      return Response.json({ ok: true, skipped: 'intro_already_sent' });
    }

    async function getContent(key) {
      const r = await base44.asServiceRole.entities.BotContent.filter({ key, is_active: true });
      return r[0]?.content || '';
    }
    async function getUrl(subType) {
      const r = await base44.asServiceRole.entities.ServiceContent.filter({ content_type: 'external_link', sub_type: subType, is_active: true });
      return r[0]?.url || '';
    }
    async function getSetting(key) {
      const r = await base44.asServiceRole.entities.SystemSetting.filter({ key });
      return r[0]?.value || '';
    }

    const botEnabled = (await getSetting('whatsapp_bot_enabled')) === 'true';
    const greenEnabled = (await getSetting('green_api_enabled')) === 'true';

    async function sendWhatsApp(message) {
      if (!message) return 'skipped';
      if (botEnabled && greenEnabled) {
        const res = await fetch(`https://api.green-api.com/waInstance${INSTANCE_ID}/sendMessage/${API_TOKEN}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatId: toChatId(contact.phone), message }),
        });
        return res.ok ? 'sent' : 'failed';
      }
      return botEnabled ? 'sent' : 'skipped';
    }

    async function log(content, templateId, status) {
      await base44.asServiceRole.entities.Communication.create({
        contact_id: reg.contact_id, type: 'whatsapp', direction: 'outbound',
        content: String(content || '').substring(0, 500), sent_by: 'system',
        is_automated: true, template_id: templateId, status,
      });
    }

    // קישור בסיס לדפי הנחיתה (sub_type webinar_landing_base, למשל https://app.example.com/webinar)
    const landingBase = await getUrl('webinar_landing_base');

    // האם סוג הוובינר ברור? אם detectWebinarType בסנכרון נפל ל-retirement כברירת מחדל,
    // עדיין נשלח את הקישור לדף הנחיתה המתאים. בירור יישלח רק אם אין כלל סוג.
    const webinarType = reg.webinar_type;
    const landingLink = landingBase ? `${landingBase.replace(/\/$/, '')}/${webinarType}` : '';

    // בירור סוג וובינר — נשלח רק אם הסוג לא הוגדר כלל (מקרה קצה)
    if (!webinarType) {
      const clarifyTemplate = await getContent('webinar_type_clarify');
      const msg = fillTemplate(clarifyTemplate || 'שלום {name}! לאיזה וובינר נרשמת?\n1) השקעות\n2) גירושין / איזון\n3) פרישה\n\nהשיבו במספר ונשלח לך קישור להרשמה 🙏', { name: contact.full_name });
      const status = await sendWhatsApp(msg);
      await log(msg, 'webinar_type_clarify', status);
      return Response.json({ ok: true, action: 'clarify_sent' });
    }

    // הודעת פתיחה + קישור לדף הנחיתה
    const introTemplate = await getContent('webinar_lead_intro');
    const message = fillTemplate(
      introTemplate || 'שלום {name}! 🎓\nראינו שהתעניינת בוובינר {webinar_label} של קרנות ראמים.\nלהשלמת ההרשמה ושמירת מקומך — הירשמו כאן:\n{landing_link}\n\nנתראה בוובינר! 🙏',
      { name: contact.full_name, landing_link: landingLink }
    ).replaceAll('{webinar_label}', TYPE_LABELS[webinarType] || '');
    const status = await sendWhatsApp(message);
    await log(message, 'webinar_lead_intro', status);

    await base44.asServiceRole.entities.Contact.update(contact.id, {
      last_bot_interaction_at: new Date().toISOString(),
    });

    return Response.json({ ok: true, action: 'intro_sent', webinar_type: webinarType });
  } catch (error) {
    console.error('onWebinarLeadCreated error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});