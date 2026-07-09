import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const INSTANCE_ID = Deno.env.get('GREEN_API_INSTANCE_ID');
const API_TOKEN = Deno.env.get('GREEN_API_TOKEN');

function normalizeLocalPhone(phone) {
  const clean = String(phone || '').replace(/[\s\-\+\(\)]/g, '');
  return clean.startsWith('972') ? '0' + clean.substring(3) : clean;
}

function normalizeIntlPhone(phone) {
  let clean = String(phone || '').replace(/[\s\-\+\(\)]/g, '');
  if (clean.startsWith('0')) clean = '972' + clean.substring(1);
  return clean;
}

const SOURCE_LABEL = {
  facebook: 'דרך פייסבוק',
  website: 'דרך האתר שלנו',
  referral: 'דרך המלצה',
  excel_import: '',
  manual: '',
  shoranss: 'דרך שורנס',
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const c = body.data || body.record || body;

    if (!c?.id || !c?.phone) return Response.json({ ok: true, skipped: 'no_phone' });
    if (c.status && c.status !== 'new_lead') return Response.json({ ok: true, skipped: 'not_new_lead' });

    async function logSkipped(reason, detailHe) {
      try {
        await base44.asServiceRole.entities.Communication.create({
          contact_id: c.id, type: 'bot_event', direction: 'outbound',
          content: `דילוג על ברכה אוטומטית — ${detailHe}`,
          sent_by: 'system', is_automated: true, template_id: 'new_lead_welcome_skipped',
          status: 'skipped', error_detail: reason,
        });
      } catch (_) { /* לא לחסום את ה-return */ }
    }

    if (c.source === 'webinar') { await logSkipped('webinar_has_own_intro', 'ליד מוובינר — מקבל פתיחה ייעודית'); return Response.json({ ok: true, skipped: 'webinar_has_own_intro' }); }

    // אם הליד כבר בשיחת בוט פעילה (כתב ראשון והבוט יצר לו Contact) — לא לשלוח ברכה כפולה
    const convKey = 'phone_conv_' + normalizeIntlPhone(c.phone);
    const existingConv = await base44.asServiceRole.entities.SystemSetting.filter({ key: convKey });
    if (existingConv.length) { await logSkipped('already_in_bot_conversation', 'הליד כבר בשיחה פעילה עם הבוט'); return Response.json({ ok: true, skipped: 'already_in_bot_conversation' }); }

    // --- gating ---
    async function getSetting(key) {
      const r = await base44.asServiceRole.entities.SystemSetting.filter({ key });
      return r[0]?.value || '';
    }

    const [botEnabledVal, greenEnabledVal, allowedRaw] = await Promise.all([
      getSetting('whatsapp_bot_enabled'),
      getSetting('green_api_enabled'),
      getSetting('test_mode_allowed_numbers'),
    ]);

    if (botEnabledVal !== 'true' || greenEnabledVal !== 'true') { await logSkipped('bot_off', 'הבוט/Green API כבוי כרגע'); return Response.json({ ok: true, skipped: 'bot_off' }); }

    const allowedTrimmed = String(allowedRaw || '').trim();
    if (allowedTrimmed) {
      const allowed = allowedTrimmed.split(',').map(n => normalizeLocalPhone(n.trim())).filter(Boolean);
      if (!allowed.includes(normalizeLocalPhone(c.phone))) { await logSkipped('test_mode_not_allowed', 'הבוט במצב בדיקות — הליד לא ברשימת המספרים המורשים'); return Response.json({ ok: true, skipped: 'test_mode_not_allowed' }); }
    }

    // --- הגנת כפילות ---
    const prior = await base44.asServiceRole.entities.Communication.filter(
      { contact_id: c.id, template_id: 'new_lead_welcome' }, '-created_date', 1
    );
    if (prior.length) { await logSkipped('already_welcomed', 'ברכה כבר נשלחה בעבר לליד הזה'); return Response.json({ ok: true, skipped: 'already_welcomed' }); }

    // --- הכנת תוכן ---
    async function getBotContent(key) {
      const r = await base44.asServiceRole.entities.BotContent.filter({ key, is_active: true });
      return r[0]?.content || '';
    }

    const sourceLabel = SOURCE_LABEL[c.source] || '';
    const chatId = normalizeIntlPhone(c.phone) + '@c.us';
    let messageToSend;
    let templateUsed;

    const missing = [];

    if (c.source === 'shoranss') {
      // מסלול שורנס — ברכה ייעודית ללא תפריט שירותים וללא pending
      templateUsed = 'new_lead_welcome';
      const template = await getBotContent('new_lead_welcome_shoranss')
        || 'שלום {name} 🌿\nהגעת לקרנות ראמים — בשמת שערי-בלוך, משרד לתכנון פרישה ופנסיה.\nראינו שפנית אלינו דרך שורנס, ושמחים שאת/ה כאן! 🙏\n\nבכל שאלה מוזמנים לפנות אלינו למספר: 0544405554';
      messageToSend = template.replaceAll('{name}', c.full_name || '');
    } else {
      // מסלול רגיל — בדיקת פרטים חסרים
      if (!c.full_name || c.full_name.trim().length < 2) missing.push({ field: 'full_name', label: 'מה השם המלא שלך?' });
      if (!c.email) missing.push({ field: 'email', label: 'מה כתובת המייל שלך?' });

      if (missing.length === 0) {
        templateUsed = 'new_lead_welcome';
        let template = await getBotContent('new_lead_welcome');
        if (!template) {
          template = 'שלום {name} 🌿\nהגעת לקרנות ראמים — בשמת שערי-בלוך, משרד לתכנון פרישה ופנסיה.\nראינו שפנית אלינו {source_label}, ושמחים שאת/ה כאן! 🙏\n\nנשמח לכוון אותך לתחום הנכון — במה את/ה מתעניין/ת?\n1. ייעוץ פרישה\n2. היתכנות כלכלית\n3. השקעות\n4. איזון אקטוארי (גירושין)\n5. ייעוץ מס (שכר גבוה)\n6. אחר\n\n👈 פשוט השב/י במספר המתאים (1-6)';
        }
        messageToSend = template
          .replaceAll('{name}', c.full_name || '')
          .replaceAll('{source_label}', sourceLabel);
        if (!sourceLabel) {
          messageToSend = messageToSend.replace(/ראינו שפנית אלינו\s*,?\s*/g, '');
        }
      } else {
        templateUsed = 'new_lead_welcome';
        let template = await getBotContent('new_lead_welcome_missing');
        if (!template) {
          template = 'שלום {name} 🌿\nהגעת לקרנות ראמים — בשמת שערי-בלוך, משרד לתכנון פרישה ופנסיה.\nראינו שפנית אלינו {source_label}, ושמחים שאת/ה כאן! 🙏\n\nלפני שנמשיך, נשמח להשלים פרט אחד: {missing_field}\nומיד נעבור לבחירת התחום שמעניין אותך 😊';
        }
        messageToSend = template
          .replaceAll('{name}', c.full_name || c.phone || '')
          .replaceAll('{source_label}', sourceLabel)
          .replaceAll('{missing_field}', missing[0].label);
        if (!sourceLabel) {
          messageToSend = messageToSend.replace(/ראינו שפנית אלינו\s*,?\s*/g, '');
        }

        const settingKey = 'pending_missing_field_' + normalizeIntlPhone(c.phone);
        const existingSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: settingKey });
        const pendingData = JSON.stringify({ contact_id: c.id, field: missing[0].field });
        if (existingSettings.length > 0) {
          await base44.asServiceRole.entities.SystemSetting.update(existingSettings[0].id, { value: pendingData });
        } else {
          await base44.asServiceRole.entities.SystemSetting.create({ key: settingKey, value: pendingData, category: 'flow' });
        }
      }
    }

    // --- שליחה ---
    const response = await fetch(`https://api.green-api.com/waInstance${INSTANCE_ID}/sendMessage/${API_TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, message: messageToSend, typingTime: 3000 }),
    });
    const sendStatus = response.ok ? 'sent' : 'failed';

    // --- עדכון Contact ---
    await base44.asServiceRole.entities.Contact.update(c.id, {
      bot_status: 'waiting_user_reply',
      last_bot_interaction_at: new Date().toISOString(),
    });

    // --- תיעוד ---
    await base44.asServiceRole.entities.Communication.create({
      contact_id: c.id,
      type: 'whatsapp',
      direction: 'outbound',
      content: String(messageToSend).substring(0, 500),
      sent_by: 'system',
      is_automated: true,
      template_id: templateUsed,
      status: sendStatus,
    });

    // --- לוג WhatsApp ---
    await base44.asServiceRole.entities.WhatsAppMessageLog.create({
      id_message: `out_welcome_${Date.now()}`,
      phone: normalizeIntlPhone(c.phone),
      direction: 'outgoing',
      text: String(messageToSend).substring(0, 500),
      status: sendStatus === 'sent' ? 'replied' : 'error',
      chat_id: chatId,
    });

    return Response.json({ ok: true, action: missing.length ? 'welcome_missing_sent' : 'welcome_sent', missing_field: missing[0]?.field || null });
  } catch (error) {
    console.error('onNewLeadWelcome error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});