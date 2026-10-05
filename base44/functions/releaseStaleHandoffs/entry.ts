import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

const HOURS = 48;
const BOSMAT = 'bosmat@oryx-alt.com';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user || user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const E = base44.asServiceRole.entities;
    const cutoff = new Date(Date.now() - HOURS * 3600 * 1000).toISOString();

    // 1. Contacts stuck waiting for an agent
    const stuck = await E.Contact.filter(
      { bot_status: { $in: ['waiting_agent', 'escalated_to_agent'] }, updated_date: { $lt: cutoff } },
      '-updated_date', 200
    );
    for (const c of stuck) {
      await E.Contact.update(c.id, { bot_status: 'in_conversation', conversation_owner: 'bot' });
      await E.Communication.create({
        contact_id: c.id, type: 'bot_event', direction: 'outbound', sent_by: 'system', is_automated: true,
        content: `שוחרר אוטומטית לבוט אחרי ${HOURS} שעות במצב "ממתין לנציגה"`,
      });
    }

    // 2. Manually paused numbers — release and notify Bosmat
    const paused = await E.WhatsAppBotControl.filter({ mode: 'paused', updated_date: { $lt: cutoff } }, '-updated_date', 200);
    for (const p of paused) {
      await E.WhatsAppBotControl.delete(p.id);
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: BOSMAT,
        subject: `הבוט חזר לפעול למספר ${p.phone}`,
        body: `שלום בשמת,<br><br>הבוט היה מושהה ידנית למספר <b>${p.phone}</b> יותר מ-${HOURS} שעות${p.note ? ` (סיבה: ${p.note})` : ''}, ולכן הוא חזר לפעול אוטומטית.<br><br>האם את עדיין מעוניינת להשהות את הבוט למספר הזה? אם כן, אפשר להשהות שוב דרך סוכן המערכת: "השהי בוט למספר ${p.phone}".`,
      }).catch((e) => console.log('email failed', p.phone, e.message));
    }

    console.log(`released contacts=${stuck.length} paused=${paused.length}`);
    return Response.json({ released_contacts: stuck.length, released_paused: paused.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}