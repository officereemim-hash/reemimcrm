import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const INSTANCE_ID = Deno.env.get('GREEN_API_INSTANCE_ID');
const API_TOKEN = Deno.env.get('GREEN_API_TOKEN');

const TEMPLATE_BY_STAGE = {
  'T+7': 'followup_t7',
  'T+14': 'followup_t14',
  'T+21': 'followup_t21',
};

function daysSince(dateString) {
  const start = new Date(dateString);
  const now = new Date();
  return Math.floor((now.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
}

function getNextStage(request, days) {
  const stage = request.followup_stage || 'none';
  if (days >= 30 && stage === 'T+21') return 'escalated';
  if (days >= 21 && stage === 'T+14') return 'T+21';
  if (days >= 14 && stage === 'T+7') return 'T+14';
  if (days >= 7 && stage === 'none') return 'T+7';
  return null;
}

function fillMessage(template, request, contact) {
  return template
    .replaceAll('{שם}', contact?.full_name || request.contact_name || '')
    .replaceAll('{name}', contact?.full_name || request.contact_name || '')
    .replaceAll('{link}', request.quote_pdf_url || '');
}

async function sendWhatsApp(phone, message) {
  let cleanPhone = phone.replace(/[\s\-\+\(\)]/g, '');
  if (cleanPhone.startsWith('0')) cleanPhone = '972' + cleanPhone.substring(1);
  const chatId = `${cleanPhone}@c.us`;
  const res = await fetch(`https://api.green-api.com/waInstance${INSTANCE_ID}/sendMessage/${API_TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId, message }),
  });
  return res.ok;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const requests = await base44.asServiceRole.entities.ServiceRequest.filter({ quote_sent: true, quote_approved: false });
    const botContents = await base44.asServiceRole.entities.BotContent.list();
    const templates = Object.fromEntries(botContents.map(item => [item.key, item.content || '']));

    let sent = 0;
    let failed = 0;
    let escalated = 0;
    let skipped = 0;

    for (const requestItem of requests) {
      if (requestItem.closed_at || !requestItem.quote_sent_at) {
        skipped++;
        continue;
      }

      const days = daysSince(requestItem.quote_sent_at);
      const nextStage = getNextStage(requestItem, days);
      if (!nextStage) {
        skipped++;
        continue;
      }

      const contacts = await base44.asServiceRole.entities.Contact.filter({ id: requestItem.contact_id });
      const contact = contacts[0];

      if (nextStage === 'escalated') {
        await base44.asServiceRole.entities.ServiceRequest.update(requestItem.id, { followup_stage: 'escalated' });
        await base44.asServiceRole.entities.Task.create({
          contact_id: requestItem.contact_id,
          service_request_id: requestItem.id,
          title: `פולו-אפ דחוף — ${contact?.full_name || requestItem.contact_name || 'לקוח'}`,
          type: 'followup',
          category: 'sales',
          status: 'open',
          priority: 'urgent',
          assigned_to: 'basmat',
          auto_generated: true,
        });
        escalated++;
        continue;
      }

      const templateKey = TEMPLATE_BY_STAGE[nextStage];
      const template = templates[templateKey];
      if (!template || !contact?.phone) {
        skipped++;
        continue;
      }

      const message = fillMessage(template, requestItem, contact);
      const ok = await sendWhatsApp(contact.phone, message);

      await base44.asServiceRole.entities.Communication.create({
        contact_id: contact.id,
        type: 'whatsapp',
        direction: 'outbound',
        content: message,
        sent_by: 'system',
        is_automated: true,
        template_id: templateKey,
        status: ok ? 'sent' : 'failed',
      });

      await base44.asServiceRole.entities.ServiceRequestTimeline.create({
        service_request_id: requestItem.id,
        event_type: 'message_sent',
        description: `נשלח פולו-אפ ${nextStage}`,
        new_value: templateKey,
      });

      if (ok) {
        await base44.asServiceRole.entities.ServiceRequest.update(requestItem.id, { followup_stage: nextStage });
        sent++;
      } else {
        failed++;
      }
    }

    return Response.json({ success: true, sent, failed, escalated, skipped, total: requests.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});