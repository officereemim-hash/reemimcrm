import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const INSTANCE_ID = Deno.env.get('GREEN_API_INSTANCE_ID');
const API_TOKEN = Deno.env.get('GREEN_API_TOKEN');

const SERVICE_LABELS = {
  retirement: 'ייעוץ פרישה',
  economic_feasibility: 'היתכנות כלכלית',
  investments: 'השקעות',
  divorce_split: 'איזון אקטוארי',
  tax_advisory: 'ייעוץ מס',
  annual_service: 'שירות שנתי',
  annual_service_call: 'שיחת שירות שנתית',
};

function normalizeIntlPhone(phone) {
  let clean = String(phone || '').replace(/[\s\-\+\(\)]/g, '');
  if (clean.startsWith('0')) clean = '972' + clean.substring(1);
  return clean;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const contact = body.data;
    const oldContact = body.old_data || {};

    if (!contact?.id) return Response.json({ ok: true, skipped: 'no_record' });
    if (contact.bot_status !== 'waiting_agent' || oldContact.bot_status === 'waiting_agent') {
      return Response.json({ ok: true, skipped: 'not_new_waiting_agent' });
    }

    async function getSetting(key) {
      const records = await base44.asServiceRole.entities.SystemSetting.filter({ key });
      return records[0]?.value || '';
    }

    const coordinatorPhone = await getSetting('coordinator_phone');
    if (!coordinatorPhone) return Response.json({ ok: true, skipped: 'no_coordinator_phone' });

    const botEnabled = (await getSetting('whatsapp_bot_enabled')) === 'true';
    const greenApiEnabled = (await getSetting('green_api_enabled')) === 'true';

    const templates = await base44.asServiceRole.entities.BotContent.filter({ key: 'coordinator_notify', is_active: true });
    const template = templates[0]?.content || '';
    if (!template) return Response.json({ ok: true, skipped: 'no_template' });

    const requests = await base44.asServiceRole.entities.ServiceRequest.filter({ contact_id: contact.id }, '-created_date', 10);
    const serviceRequest = requests.find(r => !['completed', 'cancelled', 'closed_lost', 'followup_closed'].includes(r.status)) || requests[0] || null;

    // אם כבר נקבעה שיחה/פגישה — הפונה תיאם בעצמו, אין צורך בהתראת "מבקש שתצרי קשר"
    const scheduledStatuses = ['phone_meeting', 'meeting_scheduled', 'meeting_scheduled_frontal', 'meeting_scheduled_zoom'];
    if (serviceRequest && scheduledStatuses.includes(serviceRequest.status)) {
      return Response.json({ ok: true, skipped: 'already_scheduled' });
    }

    const serviceLabel = SERVICE_LABELS[serviceRequest?.service_type] || serviceRequest?.service_type || 'שירות';

    const message = template
      .replaceAll('{name}', contact.full_name || '')
      .replaceAll('{phone}', contact.phone || '')
      .replaceAll('{service_type}', serviceLabel);

    let result = { status: 'skipped', errorDetail: 'log_only_whatsapp_bot_disabled' };
    if (botEnabled) {
      if (!greenApiEnabled) {
        result = { status: 'sent', errorDetail: 'simulated_green_api_disabled' };
      } else {
        const chatId = `${normalizeIntlPhone(coordinatorPhone)}@c.us`;
        const response = await fetch(`https://api.green-api.com/waInstance${INSTANCE_ID}/sendMessage/${API_TOKEN}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatId, message }),
        });
        const responseText = await response.text();
        result = { status: response.ok ? 'sent' : 'failed', errorDetail: response.ok ? '' : responseText.substring(0, 500) };
      }
    }

    await base44.asServiceRole.entities.Communication.create({
      contact_id: contact.id,
      type: 'whatsapp',
      direction: 'outbound',
      content: message.substring(0, 500),
      sent_by: 'system',
      is_automated: true,
      template_id: 'coordinator_notify',
      status: result.status,
      error_detail: result.errorDetail || '',
    });

    if (serviceRequest) {
      await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { coordinator_alert_sent: true });
    }

    return Response.json({ ok: true, notified: true, result });
  } catch (error) {
    console.error('notifyCoordinator error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});