import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const INSTANCE_ID = Deno.env.get('GREEN_API_INSTANCE_ID');
const API_TOKEN = Deno.env.get('GREEN_API_TOKEN');

const LOCATION_LABELS = {
  modiin: 'המעיין 44, קומה 1, מתחם M.dot, מודיעין',
  petah_tikva_wednesday: 'הקליניקה בפתח תקווה',
  zoom: 'פגישת זום',
  phone: 'שיחה טלפונית',
};

function toIsraelDateString(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(date);
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function normalizeLocalPhone(phone) {
  const clean = String(phone || '').replace(/[\s\-\+\(\)]/g, '');
  return clean.startsWith('972') ? '0' + clean.substring(3) : clean;
}

// מילוי תבנית: שורות שמכילות placeholder עם ערך ריק — מוסרות אוטומטית
function fillTemplate(template, values) {
  const lines = String(template || '').split('\n').filter(line => {
    const placeholders = line.match(/\{([^}]+)\}/g) || [];
    return !placeholders.some(p => {
      const key = p.slice(1, -1);
      return key in values && !values[key];
    });
  });
  let result = lines.join('\n');
  for (const [key, val] of Object.entries(values)) {
    result = result.replaceAll('{' + key + '}', val);
  }
  return result.replace(/\n{3,}/g, '\n\n');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    async function getSetting(key) {
      const records = await base44.asServiceRole.entities.SystemSetting.filter({ key });
      return records[0]?.value || '';
    }

    async function getContent(key) {
      const records = await base44.asServiceRole.entities.BotContent.filter({ key, is_active: true });
      return records[0]?.content || '';
    }

    async function getLink(subType) {
      const records = await base44.asServiceRole.entities.ServiceContent.filter({ content_type: 'external_link', sub_type: subType, is_active: true });
      return records[0]?.url || '';
    }

    const botEnabled = (await getSetting('whatsapp_bot_enabled')) === 'true';
    const greenApiEnabled = (await getSetting('green_api_enabled')) === 'true';
    if (!botEnabled) {
      return Response.json({ success: true, skipped: 'whatsapp_bot_disabled' });
    }

    // מצב בדיקה: אם הוגדרה רשימה לבנה — שולחים תזכורות רק למספרים שבה
    const allowedRaw = String(await getSetting('test_mode_allowed_numbers')).trim();
    const allowedNumbers = allowedRaw ? allowedRaw.split(',').map(n => normalizeLocalPhone(n.trim())).filter(Boolean) : null;

    const template = await getContent('pre_meeting_reminder');
    if (!template) {
      return Response.json({ success: false, error: 'missing_bot_content_pre_meeting_reminder' }, { status: 500 });
    }

    const wazeLinks = {
      modiin: await getLink('waze_modiin'),
      petah_tikva_wednesday: await getLink('waze_petah_tikva'),
    };
    const zoomRoomLink = await getLink('zoom_personal_room');

    const tomorrow = toIsraelDateString(addDays(new Date(), 1));
    const meetings = await base44.asServiceRole.entities.Meeting.filter({ status: 'scheduled', reminder_d1_sent: false });

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const meeting of meetings) {
      if (!meeting.scheduled_at || toIsraelDateString(new Date(meeting.scheduled_at)) !== tomorrow) {
        skipped++;
        continue;
      }

      const contacts = await base44.asServiceRole.entities.Contact.filter({ id: meeting.contact_id });
      const contact = contacts[0];
      if (!contact?.phone) {
        skipped++;
        continue;
      }

      if (allowedNumbers && !allowedNumbers.includes(normalizeLocalPhone(contact.phone))) {
        skipped++;
        continue;
      }

      const scheduled = new Date(meeting.scheduled_at);
      const time = new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' }).format(scheduled);
      const location = meeting.location || '';

      // קישור הפגישה: זום אישי קבוע, או קישור שנשמר בפגישה (Cal.com)
      const meetingZoomLink = location === 'zoom' ? (meeting.calendar_link || zoomRoomLink) : '';

      const message = fillTemplate(template, {
        name: contact.full_name || '',
        'שם': contact.full_name || '',
        time,
        location: LOCATION_LABELS[location] || location,
        waze_link: wazeLinks[location] || '',
        zoom_link: meetingZoomLink,
      });

      let result = { ok: true, errorDetail: 'simulated_green_api_disabled' };
      if (greenApiEnabled) {
        let cleanPhone = String(contact.phone).replace(/[\s\-\+\(\)]/g, '');
        if (cleanPhone.startsWith('0')) cleanPhone = '972' + cleanPhone.substring(1);
        const response = await fetch(`https://api.green-api.com/waInstance${INSTANCE_ID}/sendMessage/${API_TOKEN}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatId: `${cleanPhone}@c.us`, message }),
        });
        result = { ok: response.ok, errorDetail: response.ok ? '' : (await response.text()).substring(0, 500) };
      }

      await base44.asServiceRole.entities.Communication.create({
        contact_id: contact.id,
        type: 'whatsapp',
        direction: 'outbound',
        content: message.substring(0, 500),
        sent_by: 'system',
        is_automated: true,
        template_id: 'pre_meeting_reminder',
        status: result.ok ? 'sent' : 'failed',
        error_detail: result.errorDetail || '',
      });

      if (result.ok) {
        await base44.asServiceRole.entities.Meeting.update(meeting.id, { reminder_d1_sent: true });
        sent++;
      } else {
        failed++;
      }
    }

    return Response.json({ success: true, sent, failed, skipped, total: meetings.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});