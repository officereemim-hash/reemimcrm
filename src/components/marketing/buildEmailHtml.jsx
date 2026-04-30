// Build email-compatible HTML from template sections
// Colors: Basmat CRM purple + gold theme
const PRIMARY = '#4A2367';    // --primary
const ACCENT = '#C4993E';     // --accent (gold)
const TEXT = '#2E2E2E';       // foreground
const BG = '#F6F2ED';         // background

export default function buildEmailHtml(template) {
  const logoUrl = template.logo_url || '';
  const headerTitle = template.header_title || '';
  const greeting = template.greeting || '';
  const introText = (template.intro_text || '').replace(/\n/g, '<br>');
  const phone = template.contact_phone || '';
  const email = template.contact_email || '';

  const blocksHtml = (template.blocks || []).map(block => {
    if (block.type === 'image' && block.image_url) {
      return `<tr><td style="padding:10px 30px;">
        <img src="${block.image_url}" alt="תמונה" style="width:100%;border-radius:8px;display:block;" />
      </td></tr>`;
    }
    if (block.type === 'button' && block.button_text && block.button_url) {
      return `<tr><td style="padding:15px 30px;" align="center">
        <table cellpadding="0" cellspacing="0"><tr><td style="background-color:${ACCENT};border-radius:8px;padding:12px 28px;">
          <a href="${block.button_url}" style="color:#fff;text-decoration:none;font-weight:600;font-size:15px;font-family:Arial,sans-serif;">${block.button_text}</a>
        </td></tr></table>
      </td></tr>`;
    }
    // text block
    let html = '';
    if (block.title) {
      html += `<h2 style="color:${PRIMARY};font-size:18px;margin:0 0 8px;font-family:Arial,sans-serif;">${block.title}</h2>`;
    }
    if (block.content) {
      html += `<p style="color:${TEXT};font-size:15px;line-height:1.7;margin:0;font-family:Arial,sans-serif;">${block.content.replace(/\n/g, '<br>')}</p>`;
    }
    return html ? `<tr><td style="padding:10px 30px;">${html}</td></tr>` : '';
  }).join('\n');

  const contactParts = [];
  if (phone) contactParts.push(`טלפון: ${phone}`);
  if (email) contactParts.push(`אימייל: <a href="mailto:${email}" style="color:${ACCENT};">${email}</a>`);
  const contactHtml = contactParts.length > 0
    ? `<tr><td style="padding:15px 30px;background-color:#f5f0eb;border-radius:8px;">
        <p style="color:${TEXT};font-size:13px;text-align:center;margin:0;font-family:Arial,sans-serif;">${contactParts.join(' | ')}</p>
      </td></tr>`
    : '';

  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:${BG};font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:${BG};">
<tr><td align="center" style="padding:20px 10px;">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
  <!-- Header -->
  <tr><td style="background-color:${PRIMARY};padding:24px 30px;text-align:center;">
    ${logoUrl ? `<img src="${logoUrl}" alt="לוגו" style="max-height:50px;margin-bottom:10px;">` : ''}
    <h1 style="color:#ffffff;font-size:22px;margin:0;font-family:Arial,sans-serif;">${headerTitle}</h1>
  </td></tr>
  <!-- Greeting -->
  <tr><td style="padding:25px 30px 10px;">
    <p style="color:${PRIMARY};font-size:17px;font-weight:600;margin:0 0 8px;font-family:Arial,sans-serif;">${greeting}</p>
    <p style="color:${TEXT};font-size:15px;line-height:1.7;margin:0;font-family:Arial,sans-serif;">${introText}</p>
  </td></tr>
  <!-- Content blocks -->
  ${blocksHtml}
  <!-- Contact -->
  ${contactHtml}
  <!-- Footer -->
  <tr><td style="padding:15px 30px;text-align:center;border-top:1px solid #eee;">
    <p style="color:#999;font-size:11px;margin:0;font-family:Arial,sans-serif;">קרנות ראמים — ייעוץ פנסיוני ופיננסי</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}