import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const SERVICE_TYPE_LABELS = {
  retirement: 'ייעוץ פרישה',
  economic_feasibility: 'היתכנות כלכלית',
  investments: 'השקעות',
  divorce_split: 'איזון אקטוארי',
  tax_advisory: 'ייעוץ מס',
  annual_service_call: 'שיחת שירות שנתית',
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { event, data, old_data } = body;

    if (!data || !event) {
      return Response.json({ ok: false, error: 'Missing data or event' }, { status: 400 });
    }

    const requestId = event.entity_id || data.id;
    const newStatus = data.status;
    const oldStatus = old_data?.status || 'unknown';
    const serviceType = data.service_type;
    const contactName = data.contact_name || '';
    const contactPhone = data.contact_phone || '';
    const conversationId = data.conversation_id || '';

    // Determine what bot trigger to fire based on status change
    let botTrigger = null;
    let message = null;
    const updates = {};

    if (oldStatus !== newStatus || oldStatus === 'previous') {
      switch (newStatus) {
        case 'in_progress':
          botTrigger = 'in_progress_notification';
          message = `שלום ${contactName}! הפנייה שלך ל${SERVICE_TYPE_LABELS[serviceType] || 'שירות'} התקבלה ונציגה שלנו תחזור אליך בהקדם.`;
          updates.processing_start_date = new Date().toISOString();
          updates.current_step = 'assigned_to_agent';
          break;

        case 'quote_sent':
          botTrigger = 'quote_sent_notification';
          message = `שלום ${contactName}! הנה הצעת המחיר שלנו ל${SERVICE_TYPE_LABELS[serviceType] || 'שירות'}. נשמח לשמוע החלטתך!`;
          if (data.quote_pdf_url) message += `\n📄 ${data.quote_pdf_url}`;
          updates.quote_sent = true;
          updates.quote_sent_at = new Date().toISOString().split('T')[0];
          updates.current_step = 'quote_sent';
          break;

        case 'awaiting_client_decision':
          botTrigger = 'awaiting_decision';
          message = `שלום ${contactName}! נשמח לשמוע את החלטתך לגבי הצעת המחיר. אנו כאן לכל שאלה 😊`;
          updates.followup_stage = 'T+7';
          updates.current_step = 'awaiting_decision';
          break;

        case 'followup_active': {
          const stage = data.followup_stage || 'T+7';
          if (stage === 'T+7' || stage === 'none') {
            botTrigger = 'followup_t7';
            message = `היי ${contactName}! 😊 רק לוודא שקיבלת את ההצעה שלנו. יש שאלות? נשמח לעזור!`;
            updates.followup_stage = 'T+14';
          } else if (stage === 'T+14') {
            botTrigger = 'followup_t14';
            message = `היי ${contactName}, חזרנו לבדוק 🌱 האם הגעת להחלטה? אנו כאן לכל שאלה.`;
            updates.followup_stage = 'T+21';
          } else if (stage === 'T+21') {
            botTrigger = 'followup_t21';
            updates.followup_stage = 'escalated';
            updates.current_step = 'followup_closed';
            // No message at T+21 — escalated to agent
          }
          break;
        }

        case 'meeting_scheduled':
          botTrigger = 'meeting_confirmed';
          message = `מעולה ${contactName}! הפגישה נקבעה 📅`;
          if (data.scheduled_date_whatsapp) {
            message += `\nתור וואטסאפ: ${new Date(data.scheduled_date_whatsapp).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })}`;
          }
          if (data.scheduled_date_clinic) {
            message += `\nתור קליניקה: ${new Date(data.scheduled_date_clinic).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })}`;
          }
          message += '\nנשמח להתראות!';
          updates.current_step = 'meeting_confirmed';
          break;

        case 'completed':
          botTrigger = 'completed_review_request';
          message = `תודה ${contactName}! הטיפול הושלם בהצלחה 🌿\nנשמח אם תשאירי חוות דעת בגוגל — זה עוזר לנו מאוד!`;
          updates.closed_at = new Date().toISOString().split('T')[0];
          updates.closed_reason = 'won';
          updates.current_step = 'completed';
          break;

        case 'cancelled':
        case 'followup_closed':
        case 'closed_lost':
          updates.current_step = newStatus;
          if (!data.closed_at) updates.closed_at = new Date().toISOString().split('T')[0];
          // No bot message for these
          break;

        default:
          break;
      }
    }

    // Handle special triggers (payment, questionnaire, etc.)
    if (newStatus === 'payment_confirmed' || data.pending_bot_message === 'payment_confirmed') {
      botTrigger = 'payment_confirmed';
      message = `תודה ${contactName}! התשלום התקבל בהצלחה ✓`;
      updates.payment_confirmed = true;
      updates.current_step = 'payment_confirmed';
    }

    if (newStatus === 'questionnaire_filled' || data.pending_bot_message === 'questionnaire_filled') {
      botTrigger = 'questionnaire_filled';
      message = `תודה ${contactName}! השאלון מולא בהצלחה ✓`;
      updates.questionnaire_completed = true;
      updates.current_step = 'questionnaire_filled';
    }

    // Apply updates to the service request
    if (Object.keys(updates).length > 0) {
      await base44.asServiceRole.entities.ServiceRequest.update(requestId, updates);
    }

    // Build response
    const response = { ok: true, botTrigger };
    if (botTrigger && message) {
      response.pendingBotMessage = {
        conversationId,
        message,
        contactName,
        contactPhone,
      };
    }

    return Response.json(response);
  } catch (error) {
    console.error('onServiceRequestUpdate error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});