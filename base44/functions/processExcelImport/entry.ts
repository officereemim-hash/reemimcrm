import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    // Support both direct call (import_id) and entity automation (event.entity_id)
    const import_id = body.import_id || body.event?.entity_id;
    if (!import_id) return Response.json({ error: 'Missing import_id' }, { status: 400 });

    const excelImport = body.data || await base44.asServiceRole.entities.ExcelImport.get(import_id);
    if (!excelImport) return Response.json({ error: 'Import not found' }, { status: 404 });

    await base44.asServiceRole.entities.ExcelImport.update(import_id, { status: 'processing' });

    // Extract data from the uploaded file
    const extracted = await base44.asServiceRole.integrations.Core.ExtractDataFromUploadedFile({
      file_url: excelImport.file_url,
      json_schema: {
        type: "object",
        properties: {
          rows: {
            type: "array",
            items: {
              type: "object",
              properties: {
                full_name: { type: "string" },
                phone: { type: "string" },
                email: { type: "string" },
                notes: { type: "string" }
              }
            }
          }
        }
      }
    });

    if (extracted.status !== 'success' || !extracted.output) {
      await base44.asServiceRole.entities.ExcelImport.update(import_id, { status: 'failed', notes: 'לא ניתן לקרוא את הקובץ' });
      return Response.json({ error: 'Failed to extract data' }, { status: 400 });
    }

    const rows = extracted.output.rows || extracted.output || [];
    let importedCount = 0;
    let failedCount = 0;
    const duplicates = [];

    // Get existing contacts for dedup check
    const existingContacts = await base44.asServiceRole.entities.Contact.list();
    const existingPhones = new Set(existingContacts.map(c => c.phone?.replace(/\D/g, '')));
    const existingEmails = new Set(existingContacts.map(c => c.email?.toLowerCase()).filter(Boolean));

    for (const row of rows) {
      if (!row.full_name || !row.phone) { failedCount++; continue; }

      const cleanPhone = row.phone?.replace(/\D/g, '');
      const cleanEmail = row.email?.toLowerCase();

      // Check for duplicates
      const isDuplicatePhone = existingPhones.has(cleanPhone);
      const isDuplicateEmail = cleanEmail && existingEmails.has(cleanEmail);

      if (isDuplicatePhone || isDuplicateEmail) {
        duplicates.push(row.full_name);
        failedCount++;
        continue;
      }

      // Determine service_type from import_type
      let service_type = null;
      if (excelImport.import_type === 'retirement_interest') service_type = 'retirement';
      if (excelImport.import_type === 'divorce_interest') service_type = 'divorce_split';
      if (excelImport.import_type === 'service_meeting') service_type = 'annual_service';

      await base44.asServiceRole.entities.Contact.create({
        full_name: row.full_name,
        phone: row.phone,
        email: row.email || null,
        status: 'new_lead',
        source: 'excel_import',
        assigned_to: excelImport.assigned_to,
        service_type,
        notes: row.notes || null,
        bot_status: 'new',
        lead_temperature: 'warm',
      });

      existingPhones.add(cleanPhone);
      if (cleanEmail) existingEmails.add(cleanEmail);
      importedCount++;
    }

    // Create task for basmat if there are duplicates
    if (duplicates.length > 0) {
      await base44.asServiceRole.entities.Task.create({
        title: `ייבוא אקסל: ${duplicates.length} כפילויות — ${duplicates.slice(0, 3).join(', ')}${duplicates.length > 3 ? '...' : ''}`,
        type: 'followup',
        category: 'operational',
        status: 'open',
        priority: 'normal',
        assigned_to: 'basmat',
        auto_generated: true,
      });
    }

    await base44.asServiceRole.entities.ExcelImport.update(import_id, {
      status: 'completed',
      imported_count: importedCount,
      failed_count: failedCount,
      imported_at: new Date().toISOString().split('T')[0],
      notes: duplicates.length > 0 ? `${duplicates.length} כפילויות הועברו לטיפול בשמת` : null,
    });

    return Response.json({ success: true, importedCount, failedCount, duplicates: duplicates.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});