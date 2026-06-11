import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ===== Brevo Webhook — מעקב בסיסי אחרי מיילים =====
// מקבל אירועי delivered / opened / click / bounce / spam מ-Brevo,
// מעדכן את שורת התור (CampaignQueue) ואת מוני הקמפיין (Campaign),
// ומסמן כתובות מייל לא תקינות (hard bounce) או בקשות spam כהסרה מתפוצה.
//
// הגדרה ב-Brevo: Settings → Webhooks → Add webhook (Transactional)
// URL: https://basmat-crm-copy-62c92ace.base44.app/api/apps/69f3c646e222353462c92ace/functions/brevoWebhook?key=<BREVO_WEBHOOK_SECRET>
// Events: Delivered, Opened, Clicked, Hard bounce, Soft bounce, Spam, Blocked

// סדר עדיפות סטטוסים — לא "מורידים" סטטוס (opened לא יחזור ל-delivered)
const STATUS_RANK = { pending: 0, skipped: 0, sent: 1, delivered: 2, opened: 3, clicked: 4, bounced: 5, failed: 5 };

Deno.serve(async (req) => {
  try {
    // אימות בסיסי: סוד ב-query string מול משתנה סביבה (אם הוגדר)
    const url = new URL(req.url);
    const secret = Deno.env.get('BREVO_WEBHOOK_SECRET') || '';
    if (secret && url.searchParams.get('key') !== secret) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const reconstructedReq = new Request(req.url, { method: req.method, headers: req.headers });
    const base44 = createClientFromRequest(reconstructedReq);

    const event = await req.json();
    const eventType = event.event || '';          // delivered | opened | unique_opened | click | hard_bounce | soft_bounce | spam | blocked | error
    const messageId = event['message-id'] || '';
    const email = (event.email || '').toLowerCase();

    if (!eventType) return Response.json({ ok: true, skipped: 'no event type' });

    // איתור שורת התור לפי מזהה ההודעה של Brevo
    let item = null;
    if (messageId) {
      const matches = await base44.asServiceRole.entities.CampaignQueue.filter({ brevo_message_id: messageId });
      item = matches?.[0] || null;
    }
    // fallback — לפי כתובת מייל בשורות האחרונות
    if (!item && email) {
      const recent = await base44.asServiceRole.entities.CampaignQueue.filter({ channel: 'email', recipient: email }, '-created_date', 5);
      item = recent?.[0] || null;
    }
    if (!item) return Response.json({ ok: true, skipped: 'queue item not found' });

    // מיפוי סוג האירוע לסטטוס + מונה בקמפיין
    let newStatus = null;
    let counterField = null;
    if (eventType === 'delivered') {
      newStatus = 'delivered';
    } else if (eventType === 'opened' || eventType === 'unique_opened' || eventType === 'proxy_open') {
      newStatus = 'opened';
      counterField = 'opens_count';
    } else if (eventType === 'click') {
      newStatus = 'clicked';
      counterField = 'clicks_count';
    } else if (eventType === 'hard_bounce' || eventType === 'soft_bounce' || eventType === 'blocked' || eventType === 'error') {
      newStatus = 'bounced';
      counterField = 'bounces_count';
    } else if (eventType === 'spam' || eventType === 'complaint') {
      newStatus = 'bounced';
      counterField = 'bounces_count';
    } else {
      return Response.json({ ok: true, skipped: `unhandled event: ${eventType}` });
    }

    // עדכון שורת התור — רק אם זה "קידום" סטטוס, וספירת המונה רק בפעם הראשונה
    const currentRank = STATUS_RANK[item.status] ?? 0;
    const newRank = STATUS_RANK[newStatus] ?? 0;
    const isFirstTimeForStatus = newRank > currentRank;

    if (isFirstTimeForStatus) {
      await base44.asServiceRole.entities.CampaignQueue.update(item.id, {
        status: newStatus,
        error_message: newStatus === 'bounced' ? `Brevo: ${eventType} — ${event.reason || ''}`.slice(0, 300) : item.error_message,
      });

      if (counterField && item.campaign_id) {
        const campaigns = await base44.asServiceRole.entities.Campaign.filter({ id: item.campaign_id });
        const campaign = campaigns?.[0];
        if (campaign) {
          await base44.asServiceRole.entities.Campaign.update(campaign.id, {
            [counterField]: (campaign[counterField] || 0) + 1,
          });
        }
      }
    }

    // טיפול בכתובות בעייתיות
    if (item.contact_id) {
      if (eventType === 'hard_bounce') {
        await base44.asServiceRole.entities.Contact.update(item.contact_id, { email_invalid: true }).catch(() => {});
      }
      if (eventType === 'spam' || eventType === 'complaint') {
        // סימון כתלונת ספאם — הסרה מוחלטת מהתפוצה
        await base44.asServiceRole.entities.Contact.update(item.contact_id, { mailing_opt_out: true }).catch(() => {});
        await base44.asServiceRole.entities.Communication.create({
          contact_id: item.contact_id,
          type: 'note',
          direction: 'inbound',
          content: 'הלקוח/ה סימן/ה את הדיוור כספאם — הוסר/ה אוטומטית מרשימת התפוצה',
          sent_by: 'system',
          is_automated: true,
          status: 'sent',
        }).catch(() => {});
      }
    }

    return Response.json({ ok: true, event: eventType, item_id: item.id });
  } catch (error) {
    console.error('brevoWebhook error:', error);
    // מחזירים 200 כדי ש-Brevo לא יציף בניסיונות חוזרים על שגיאות פנימיות
    return Response.json({ ok: false, error: String(error.message || error) });
  }
});