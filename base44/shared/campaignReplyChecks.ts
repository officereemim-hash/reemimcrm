import { hasProtectedRoute, matchesCampaignContext } from './campaignReply.ts';

export function runCampaignReplyChecks() {
  const now = Date.parse('2026-09-17T06:04:00Z');
  const contact = { id: 'contact-test', source: 'excel_import', bot_status: 'new' };
  const item = { id: 'queue-test', contact_id: contact.id, recipient: '972500000000', channel: 'whatsapp', campaign_id: 'campaign-test', status: 'sent', sent_at: '2026-09-17T06:00:00Z' };
  const comm = { direction: 'outbound', template_id: 'campaign_campaign-test', created_date: '2026-09-17T06:00:01Z' };
  const match = (i = item, c = comm, out = null, phone = item.recipient) => matchesCampaignContext(i, contact, phone, c, out, now);
  const protectedRoute = (c = contact, requests = [], regs = [], pending = []) => hasProtectedRoute(c, requests, regs, pending, now);
  const checks = [
    ['confirmed_campaign_reply', match() && !protectedRoute()],
    ['pending_is_not_sent', !match({ ...item, status: 'pending' })],
    ['failed_is_not_sent', !match({ ...item, status: 'failed' })],
    ['different_recipient', !match(item, comm, null, '972511111111')],
    ['different_contact', !match({ ...item, contact_id: 'other' })],
    ['email_is_not_whatsapp_reply', !match({ ...item, channel: 'email' })],
    ['no_campaign', !match(null)],
    ['old_campaign', !match({ ...item, sent_at: '2026-09-01T06:00:00Z' })],
    ['service_message_takes_priority', !match(item, { ...comm, template_id: 'questionnaire_request' })],
    ['service_log_takes_priority', !match(item, comm, { id_message: 'out_service', created_date: '2026-09-17T06:02:00Z' })],
    ['campaign_conversation_continues', match(item, { ...comm, template_id: 'campaign_reply_queue-test' }, { id_message: 'campaign_reply_queue-test_123', created_date: '2026-09-17T06:02:00Z' })],
    ['explicit_request_exits_context', !match(item, { ...comm, direction: 'inbound', template_id: 'campaign_reply_exit_queue-test' })],
    ['new_service_is_protected', protectedRoute(contact, [{ status: 'new' }])],
    ['questionnaire_is_protected', protectedRoute(contact, [{ status: 'meeting_scheduled', current_step: 'waiting_id_details' }])],
    ['webinar_lead_is_protected', protectedRoute({ ...contact, source: 'webinar' })],
    ['future_webinar_is_protected', protectedRoute(contact, [], [{ webinar_date: '2026-09-18T06:00:00Z' }])],
    ['webinar_benefit_is_protected', protectedRoute(contact, [], [{ coupon_sent: true }])],
    ['pending_details_are_protected', protectedRoute(contact, [], [], [{ value: '{}' }])],
    ['waiting_reply_is_protected', protectedRoute({ ...contact, bot_status: 'waiting_user_reply' })],
    ['completed_service_not_active', !protectedRoute(contact, [{ status: 'completed' }])],
  ];
  const failed = checks.filter(([, passed]) => !passed).map(([name]) => name);
  return { ok: failed.length === 0, checks: checks.length, passed: checks.length - failed.length, failed, sends: 0, writes: 0, llm_calls: 0 };
}