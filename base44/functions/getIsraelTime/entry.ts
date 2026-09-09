import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

const DAYS = ['יום ראשון', 'יום שני', 'יום שלישי', 'יום רביעי', 'יום חמישי', 'יום שישי', 'שבת'];

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jerusalem',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short',
    }).formatToParts(now);
    const get = (type) => parts.find((p) => p.type === type)?.value || '';
    const weekdayIndex = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
    const date = `${get('day')}.${get('month')}.${get('year')}`;
    const time = `${get('hour')}:${get('minute')}`;

    return Response.json({
      timezone: 'Asia/Jerusalem',
      iso_utc: now.toISOString(),
      date,
      time,
      weekday: DAYS[weekdayIndex] || '',
      display: `${DAYS[weekdayIndex] || ''}, ${date}, ${time}`,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}