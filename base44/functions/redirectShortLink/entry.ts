import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');

    if (!code) {
      return new Response('<html dir="rtl"><body style="font-family:Arial;text-align:center;padding:60px"><h1>קישור לא תקין</h1><p>חסר קוד קישור.</p></body></html>', {
        status: 400,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    const base44 = createClientFromRequest(req);
    const links = await base44.asServiceRole.entities.ShortLink.filter({ code });
    const link = links[0];

    if (!link) {
      return new Response('<html dir="rtl"><body style="font-family:Arial;text-align:center;padding:60px"><h1>הקישור לא נמצא</h1><p>ייתכן שפג תוקפו או שהכתובת שגויה.</p></body></html>', {
        status: 404,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    // עדכון מונה קליקים (fire-and-forget)
    base44.asServiceRole.entities.ShortLink.update(link.id, { click_count: (link.click_count || 0) + 1 }).catch(() => {});

    return new Response(null, {
      status: 302,
      headers: { Location: link.target_url },
    });
  } catch (error) {
    console.error('redirectShortLink error:', error.message);
    return new Response('<html dir="rtl"><body style="font-family:Arial;text-align:center;padding:60px"><h1>שגיאה</h1><p>אירעה שגיאה, נסו שוב מאוחר יותר.</p></body></html>', {
      status: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
});