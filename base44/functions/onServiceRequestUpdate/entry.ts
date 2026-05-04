import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    const { event, data, old_data } = body;

    if (event?.type !== 'update' || !data || !old_data) {
      return Response.json({ ok: true, skipped: true });
    }

    const newStatus = data.status;
    const oldStatus = old_data.status;
    const requestId = event.entity_id;

    // --- Frontend pending message handler ---
    const knownTriggers = [
      'ready_to_schedule', 'paid_consultation', 'paid_legal', 'paid_lectures', 'paid_clinic', 'paid_post_lecture',
      'payment_confirmed_awaiting_questionnaire', 'questionnaire_completed_awaiting_payment',
      'waiting_for_admin_approval',
      'send_full_consultation_link', 'both_appointments_scheduled',
      'scheduled_consultation', 'scheduled_legal', 'scheduled_lectures', 'scheduled_clinic', 'scheduled_post_lecture',
      'paid', 'questionnaire_completed', 'scheduled', 'scheduled_whatsapp', 'whatsapp_message_to_check', 'in_review',
      // Legacy triggers from this app
      'in_progress_notification', 'quote_sent_notification', 'awaiting_decision',
      'followup_t7', 'followup_t14', 'followup_t21',
      'meeting_confirmed', 'completed_review_request', 'payment_confirmed', 'questionnaire_filled',
    ];

    const rawStatuses = ['paid', 'questionnaire_completed', 'scheduled', 'scheduled_whatsapp', 'whatsapp_message_to_check', 'in_review'];
    const isRawStatus = rawStatuses.includes(newStatus);

    if (oldStatus === 'previous' && knownTriggers.includes(newStatus)) {
      console.log(`Frontend pending message request: trigger=${newStatus}, request=${requestId}, isRaw=${isRawStatus}`);

      const fullRequest = await base44.asServiceRole.entities.ServiceRequest.get(requestId);
      let contactName = fullRequest.contact_name || '';
      let contactPhone = fullRequest.contact_phone || '';
      const rawConversationId = data.conversation_id || fullRequest.conversation_id || null;
      const conversationId = (rawConversationId && rawConversationId !== fullRequest.contact_id) ? rawConversationId : null;

      if ((!contactName || !contactPhone) && fullRequest.contact_id) {
        try {
          const contact = await base44.asServiceRole.entities.Contact.get(fullRequest.contact_id);
          if (contact) {
            if (!contactName) contactName = contact.full_name || '';
            if (!contactPhone) contactPhone = contact.phone || '';
          }
        } catch (e) { console.warn('Could not fetch contact:', e.message); }
      }

      let effectiveTrigger = newStatus;
      if (isRawStatus) {
        effectiveTrigger = computeTriggerForStatus(newStatus, fullRequest);
        console.log(`Raw status ${newStatus} resolved to trigger: ${effectiveTrigger}`);
        if (!effectiveTrigger) {
          return Response.json({ ok: true, botTrigger: null, reason: 'no_trigger_for_status' });
        }
      }

      const botMessage = await buildBotMessage(base44, effectiveTrigger, fullRequest, contactName);

      if (botMessage) {
        const isValidObjectId = (id) => /^[a-f0-9]{24}$/i.test(id);
        const effectiveConversationId = (conversationId && isValidObjectId(conversationId)) ? conversationId : null;

        return Response.json({
          ok: true,
          botTrigger: effectiveTrigger,
          botSent: false,
          pendingBotMessage: {
            conversationId: effectiveConversationId,
            message: botMessage,
            contactName,
            contactPhone,
            botTrigger: effectiveTrigger,
          }
        });
      }

      return Response.json({ ok: true, botTrigger: effectiveTrigger, botSent: false, reason: 'no_message' });
    }

    // --- Normal entity automation path ---
    if (newStatus === oldStatus) {
      return Response.json({ ok: true, skipped: true, reason: 'status_unchanged' });
    }

    console.log(`Status changed: ${oldStatus} -> ${newStatus} for request ${requestId}, type: ${data.service_type}`);

    const updates = {};
    const timelineEntries = [];
    let botTrigger = null;

    // Handle status -> paid
    if (newStatus === 'paid' && oldStatus !== 'paid') {
      updates.payment_confirmed = true;
      timelineEntries.push({
        service_request_id: requestId,
        event_type: 'system_note',
        description: 'תשלום אושר אוטומטית',
        old_value: oldStatus,
        new_value: 'paid',
      });

      const serviceType = data.service_type;
      if (serviceType === 'retirement' || serviceType === 'economic_feasibility') {
        const latestReq = await base44.asServiceRole.entities.ServiceRequest.get(requestId);
        if (latestReq.questionnaire_completed) {
          updates.current_step = 'ready_to_schedule';
          botTrigger = 'ready_to_schedule';
        } else {
          updates.current_step = 'paid_consultation';
          botTrigger = 'paid_consultation';
        }
      } else if (serviceType === 'divorce_split') {
        updates.current_step = 'send_privacy_message';
        botTrigger = 'paid_legal';
      } else if (serviceType === 'investments') {
        updates.current_step = 'confirm_payment';
        botTrigger = 'paid_lectures';
      } else if (serviceType === 'tax_advisory') {
        updates.current_step = 'confirm_payment';
        botTrigger = 'paid_clinic';
      }
    }

    // Handle status -> questionnaire_completed
    if ((newStatus === 'questionnaire_completed' || newStatus === 'questionnaire_filled') && oldStatus !== newStatus) {
      updates.questionnaire_completed = true;
      const latestReq = await base44.asServiceRole.entities.ServiceRequest.get(requestId);
      const paymentDone = latestReq.payment_confirmed === true;
      timelineEntries.push({
        service_request_id: requestId,
        event_type: 'system_note',
        description: 'שאלון מולא',
        old_value: oldStatus,
        new_value: newStatus,
      });
      if (paymentDone) {
        updates.current_step = 'ready_to_schedule';
        botTrigger = 'ready_to_schedule';
      } else {
        updates.current_step = 'questionnaire_completed_awaiting_payment';
        botTrigger = 'questionnaire_completed_awaiting_payment';
      }
    }

    // Handle status -> in_progress / in_review
    if ((newStatus === 'in_progress' || newStatus === 'in_review') && oldStatus !== newStatus) {
      if (!data.processing_start_date) {
        updates.processing_start_date = new Date().toISOString();
      }
      timelineEntries.push({
        service_request_id: requestId,
        event_type: 'status_change',
        description: newStatus === 'in_progress' ? 'תחילת טיפול' : 'תחילת סקירה',
        old_value: oldStatus,
        new_value: newStatus,
      });
    }

    // Handle status -> meeting_scheduled / scheduled
    if ((newStatus === 'meeting_scheduled' || newStatus === 'scheduled') && oldStatus !== newStatus) {
      timelineEntries.push({
        service_request_id: requestId,
        event_type: 'status_change',
        description: 'תור נקבע',
        old_value: oldStatus,
        new_value: newStatus,
      });

      const serviceType = data.service_type;
      if (data.pending_bot_message === 'both_appointments_scheduled') {
        botTrigger = 'both_appointments_scheduled';
      } else if (serviceType === 'retirement' || serviceType === 'economic_feasibility') {
        botTrigger = 'scheduled_consultation';
      } else if (serviceType === 'divorce_split') {
        botTrigger = 'scheduled_legal';
      } else if (serviceType === 'investments') {
        botTrigger = 'scheduled_lectures';
      } else if (serviceType === 'tax_advisory') {
        botTrigger = 'scheduled_clinic';
      } else {
        botTrigger = 'meeting_confirmed';
      }
    }

    // Handle scheduled_whatsapp
    if (newStatus === 'scheduled_whatsapp' && oldStatus !== 'scheduled_whatsapp') {
      timelineEntries.push({
        service_request_id: requestId,
        event_type: 'status_change',
        description: 'תור ווצאפ נקבע',
        old_value: oldStatus,
        new_value: 'scheduled_whatsapp',
      });
      botTrigger = 'send_full_consultation_link';
    }

    // Handle appointment triggers
    if (!botTrigger) {
      const appointmentTriggers = ['send_full_consultation_link', 'both_appointments_scheduled'];
      if (appointmentTriggers.includes(newStatus)) {
        botTrigger = newStatus;
      } else if (data.pending_bot_message && appointmentTriggers.includes(data.pending_bot_message)) {
        botTrigger = data.pending_bot_message;
      }
    }

    // Handle whatsapp_message_to_check
    if (newStatus === 'whatsapp_message_to_check') {
      botTrigger = 'waiting_for_admin_approval';
      timelineEntries.push({
        service_request_id: requestId,
        event_type: 'system_note',
        description: 'הבוט הועבר לבדיקה אנושית',
        old_value: oldStatus,
        new_value: 'whatsapp_message_to_check',
      });
    }

    // Handle quote_sent
    if (newStatus === 'quote_sent' && oldStatus !== 'quote_sent') {
      updates.quote_sent = true;
      updates.quote_sent_at = new Date().toISOString().split('T')[0];
      updates.current_step = 'quote_sent';
      botTrigger = 'quote_sent_notification';
      timelineEntries.push({
        service_request_id: requestId,
        event_type: 'status_change',
        description: 'הצעת מחיר נשלחה',
        old_value: oldStatus,
        new_value: 'quote_sent',
      });
    }

    // Handle followup_active
    if (newStatus === 'followup_active' && oldStatus !== 'followup_active') {
      const stage = data.followup_stage || 'T+7';
      if (stage === 'T+7' || stage === 'none') {
        botTrigger = 'followup_t7';
        updates.followup_stage = 'T+14';
      } else if (stage === 'T+14') {
        botTrigger = 'followup_t14';
        updates.followup_stage = 'T+21';
      } else if (stage === 'T+21') {
        updates.followup_stage = 'escalated';
        updates.current_step = 'followup_closed';
      }
    }

    // Handle completed
    if (newStatus === 'completed' && oldStatus !== 'completed') {
      botTrigger = 'completed_review_request';
      updates.closed_at = new Date().toISOString().split('T')[0];
      updates.closed_reason = 'won';
      updates.current_step = 'completed';
    }

    // Handle cancelled / closed
    if (['cancelled', 'followup_closed', 'closed_lost'].includes(newStatus) && oldStatus !== newStatus) {
      updates.current_step = newStatus;
      if (!data.closed_at) updates.closed_at = new Date().toISOString().split('T')[0];
    }

    // Write pending_bot_message so frontend hook can pick it up
    if (botTrigger) {
      updates.pending_bot_message = botTrigger;
    }

    // Apply updates
    if (Object.keys(updates).length > 0) {
      await base44.asServiceRole.entities.ServiceRequest.update(requestId, updates);
      console.log('Applied updates:', updates);
    }

    // Create timeline entries
    for (const entry of timelineEntries) {
      await base44.asServiceRole.entities.ServiceRequestTimeline.create(entry);
    }

    // Build and return bot message
    if (botTrigger) {
      const fullRequest = await base44.asServiceRole.entities.ServiceRequest.get(requestId);
      let contactName = fullRequest.contact_name || '';
      let contactPhone = fullRequest.contact_phone || '';
      const rawConversationId = fullRequest.conversation_id || null;
      const conversationId = (rawConversationId && rawConversationId !== fullRequest.contact_id) ? rawConversationId : null;

      if ((!contactName || !contactPhone) && fullRequest.contact_id) {
        try {
          const contact = await base44.asServiceRole.entities.Contact.get(fullRequest.contact_id);
          if (contact) {
            if (!contactName) contactName = contact.full_name || '';
            if (!contactPhone) contactPhone = contact.phone || '';
            await base44.asServiceRole.entities.ServiceRequest.update(requestId, { contact_name: contactName, contact_phone: contactPhone });
          }
        } catch (e) { console.warn('Could not fetch contact:', e.message); }
      }

      console.log(`Processing bot trigger: ${botTrigger}`, { contactName, contactPhone, conversationId });

      const botMessage = await buildBotMessage(base44, botTrigger, fullRequest, contactName);

      if (botMessage) {
        const isValidObjectId = (id) => /^[a-f0-9]{24}$/i.test(id);
        const passedConversationId = data.conversation_id || null;
        const contactId = fullRequest.contact_id || data.contact_id || null;
        const effectiveConversationId = (conversationId && isValidObjectId(conversationId))
          ? conversationId
          : (passedConversationId && isValidObjectId(passedConversationId) && passedConversationId !== contactId)
            ? passedConversationId
            : null;

        return Response.json({
          ok: true,
          updates,
          timelineCount: timelineEntries.length,
          botTrigger,
          botSent: false,
          pendingBotMessage: {
            conversationId: effectiveConversationId,
            message: botMessage,
            contactName,
            contactPhone,
            botTrigger,
          }
        });
      }
    }

    return Response.json({ ok: true, updates, timelineCount: timelineEntries.length, botTrigger });
  } catch (error) {
    console.error('Error in onServiceRequestUpdate:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// --- Compute trigger from raw status ---
function computeTriggerForStatus(status, req) {
  if (status === 'paid') {
    const st = req.service_type;
    if (st === 'retirement' || st === 'economic_feasibility') return 'paid_consultation';
    if (st === 'divorce_split') return 'paid_legal';
    if (st === 'investments') return 'paid_lectures';
    if (st === 'tax_advisory') return 'paid_clinic';
    return null;
  }
  if (status === 'questionnaire_completed') {
    return req.payment_confirmed ? 'ready_to_schedule' : 'questionnaire_completed_awaiting_payment';
  }
  if (status === 'scheduled_whatsapp') return 'send_full_consultation_link';
  if (status === 'scheduled') {
    if (req.pending_bot_message === 'both_appointments_scheduled') return 'both_appointments_scheduled';
    const st = req.service_type;
    const map = { retirement: 'scheduled_consultation', economic_feasibility: 'scheduled_consultation', divorce_split: 'scheduled_legal', investments: 'scheduled_lectures', tax_advisory: 'scheduled_clinic' };
    return map[st] || null;
  }
  if (status === 'whatsapp_message_to_check') return 'waiting_for_admin_approval';
  if (status === 'in_review') return null;
  return null;
}

// --- Bot message builder ---
async function buildBotMessage(base44, trigger, fullRequest, contactName) {
  const SERVICE_TYPE_LABELS = {
    retirement: 'ייעוץ פרישה',
    economic_feasibility: 'היתכנות כלכלית',
    investments: 'השקעות',
    divorce_split: 'איזון אקטוארי',
    tax_advisory: 'ייעוץ מס',
    annual_service_call: 'שיחת שירות שנתית',
  };
  const serviceLabel = SERVICE_TYPE_LABELS[fullRequest.service_type] || 'שירות';

  if (trigger === 'waiting_for_admin_approval') {
    return `תודה על העדכון. התשלום ייבדק על ידי הצוות ויאושר בהקדם. נמשיך בתהליך ברגע שהתשלום יאושר. אנא המתן/י לעדכון מאיתנו.`;
  }

  if (trigger === 'ready_to_schedule') {
    const infoRecords = await base44.asServiceRole.entities.BotContent.filter({ key: 'consultation_info_two_meetings' });
    const whatsappLinkSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'consultation_whatsapp_link' });
    const infoText = infoRecords.length > 0 ? infoRecords[0].content : `היי ${contactName}! כל התנאים מולאו - אפשר לקבוע תור.`;
    const whatsappUrl = whatsappLinkSettings.length > 0 ? whatsappLinkSettings[0].value : '';
    let msg = infoText.replace('{שם}', contactName);
    if (whatsappUrl) msg += `\n\nקישור לקביעת פגישת ווצאפ:\n${whatsappUrl}\n\nלאחר קביעת התור, כתוב/י "קבעתי" ✓`;
    return msg;
  }

  if (trigger === 'paid_consultation') {
    const botContentRecords = await base44.asServiceRole.entities.BotContent.filter({ key: 'consultation_questionnaire_request' });
    const questionnaireContent = await base44.asServiceRole.entities.ServiceContent.filter({ service_type: fullRequest.service_type, content_type: 'questionnaire' });
    const questionnaireUrl = questionnaireContent.length > 0 ? questionnaireContent[0].url : '';
    if (botContentRecords.length > 0) {
      return botContentRecords[0].content.replace('{שם}', contactName).replace('{קישור_שאלון}', questionnaireUrl);
    }
    return `היי ${contactName}, קיבלנו את התשלום — תודה רבה! 🙏\n\nכדי להתקדם, בבקשה למלא את השאלון הבא:\n${questionnaireUrl}`;
  }

  if (trigger === 'questionnaire_completed_awaiting_payment' || trigger === 'payment_confirmed_awaiting_questionnaire') {
    const botContentRecords = await base44.asServiceRole.entities.BotContent.filter({ key: 'consultation_payment_only_request' });
    const paymentContent = await base44.asServiceRole.entities.ServiceContent.filter({ service_type: fullRequest.service_type, content_type: 'payment_link' });
    const paymentUrl = paymentContent.length > 0 ? paymentContent[0].url : '';
    if (botContentRecords.length > 0) {
      return botContentRecords[0].content.replace('{קישור_תשלום}', paymentUrl);
    }
    return `מעולה! עכשיו נמשיך לשלב התשלום 💳\n\nהנה קישור לתשלום:\n${paymentUrl}`;
  }

  if (trigger === 'paid_legal') {
    const settings = await base44.asServiceRole.entities.BotContent.filter({ key: 'legal_payment_confirmed' });
    let msg = settings.length > 0
      ? settings[0].content.replace('{שם פרטי}', contactName).replace('{שם}', contactName)
      : `היי ${contactName}, ראינו ששילמת! תודה רבה.`;
    const privacySettings = await base44.asServiceRole.entities.BotContent.filter({ key: 'privacy_message' });
    if (privacySettings.length > 0) msg += '\n\n' + privacySettings[0].content;
    return msg;
  }

  if (trigger === 'paid_lectures' || trigger === 'paid_clinic' || trigger === 'paid_post_lecture') {
    return `היי ${contactName}, קיבלנו את התשלום — תודה רבה! 🙏`;
  }

  if (trigger === 'send_full_consultation_link') {
    const introRecords = await base44.asServiceRole.entities.BotContent.filter({ key: 'whatsapp_booked_second_link_intro' });
    const linkSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'consultation_full_link' });
    const introText = introRecords.length > 0 ? introRecords[0].content : 'מעולה! עכשיו נמשיך לקביעת הפגישה המלאה:';
    const fullLink = linkSettings.length > 0 ? linkSettings[0].value : '';
    const targetFriday = fullRequest.target_friday || '';
    const linkWithDate = targetFriday ? `${fullLink}?date=${targetFriday}` : fullLink;
    return `✅ נקבע תור לזמינות בווצאפ!\n\n${introText}\n${linkWithDate}\n\nלאחר קביעת התור, כתוב/י "קבעתי" ✓`;
  }

  if (trigger === 'both_appointments_scheduled') {
    const confirmRecords = await base44.asServiceRole.entities.BotContent.filter({ key: 'both_appointments_booked_confirmation' });
    if (confirmRecords.length > 0) return confirmRecords[0].content;
    return `מצוין! שתי הפגישות נקבעו בהצלחה 🌷\nנתראה אז. בהצלחה!`;
  }

  if (trigger.startsWith('scheduled_')) {
    const timeStr = fullRequest.last_appointment_time_str || '';
    const records = await base44.asServiceRole.entities.BotContent.filter({ key: 'appointment_scheduled' });
    if (records.length > 0 && records[0].content) return records[0].content.replace('{time}', timeStr);
    return `✅ נקבע מועד לפגישה! 🎉\nיום ושעה: ${timeStr}\n\nנשמח לראותך! 😊`;
  }

  // Legacy triggers
  if (trigger === 'in_progress_notification') {
    return `שלום ${contactName}! הפנייה שלך ל${serviceLabel} התקבלה ונציגה שלנו תחזור אליך בהקדם.`;
  }
  if (trigger === 'quote_sent_notification') {
    let msg = `שלום ${contactName}! הנה הצעת המחיר שלנו ל${serviceLabel}. נשמח לשמוע החלטתך!`;
    if (fullRequest.quote_pdf_url) msg += `\n📄 ${fullRequest.quote_pdf_url}`;
    return msg;
  }
  if (trigger === 'meeting_confirmed') {
    let msg = `מעולה ${contactName}! הפגישה נקבעה 📅`;
    if (fullRequest.scheduled_date_whatsapp) msg += `\nתור וואטסאפ: ${new Date(fullRequest.scheduled_date_whatsapp).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })}`;
    if (fullRequest.scheduled_date_clinic) msg += `\nתור קליניקה: ${new Date(fullRequest.scheduled_date_clinic).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })}`;
    msg += '\nנשמח להתראות!';
    return msg;
  }
  if (trigger === 'completed_review_request') {
    return `תודה ${contactName}! הטיפול הושלם בהצלחה 🌿\nנשמח אם תשאירי חוות דעת בגוגל — זה עוזר לנו מאוד!`;
  }
  if (trigger === 'payment_confirmed' || trigger === 'questionnaire_filled') {
    return `תודה ${contactName}! ${trigger === 'payment_confirmed' ? 'התשלום התקבל' : 'השאלון מולא'} בהצלחה ✓`;
  }
  if (trigger === 'followup_t7') {
    return `היי ${contactName}! 😊 רק לוודא שקיבלת את ההצעה שלנו. יש שאלות? נשמח לעזור!`;
  }
  if (trigger === 'followup_t14') {
    return `היי ${contactName}, חזרנו לבדוק 🌱 האם הגעת להחלטה? אנו כאן לכל שאלה.`;
  }

  return '';
}