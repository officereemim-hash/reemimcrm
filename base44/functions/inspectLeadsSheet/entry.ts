import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const SPREADSHEET_ID = '1NZGh13s9AMQy-tROtUDxdI8nQ0K4Dq8pgp4MCIQDvJg';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlesheets');

    // Get spreadsheet metadata (tab names)
    const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}?fields=sheets.properties`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const meta = await metaRes.json();
    if (!metaRes.ok) {
      return Response.json({ error: meta.error?.message || 'meta failed' }, { status: 500 });
    }

    const tabs = (meta.sheets || []).map(s => s.properties.title);

    // Read first 5 rows of the first 2 tabs
    const samples = {};
    for (const tab of tabs.slice(0, 2)) {
      const rangeRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(`'${tab}'!A1:Z5`)}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const rangeData = await rangeRes.json();
      samples[tab] = rangeData.values || [];
    }

    return Response.json({ tabs, samples });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});