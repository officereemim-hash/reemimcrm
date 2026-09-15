function escapeHtml(value) { return String(value || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
// Preserve the existing birthday email, separate from Meta's approved WhatsApp copy.
export default function birthdayEmail(message) {
  return `<div dir="rtl" style="font-family:'Heebo',Arial,sans-serif;max-width:600px;margin:0 auto;background:#faf8f5;border-radius:12px;overflow:hidden">
    <div style="background:#4A2C78;padding:20px 30px;text-align:center"><h1 style="color:#fff;margin:0;font-size:22px">🎂 יום הולדת שמח!</h1></div>
    <div style="padding:30px;background:#fff"><p style="font-size:16px;line-height:1.8;color:#2c2c2c;white-space:pre-line">${escapeHtml(message)}</p></div>
    <div style="padding:16px 30px;background:#f5f0ea;text-align:center;font-size:12px;color:#999"><p style="margin:0">קרנות ראמים | בשמת שערי בלוך</p></div>
  </div>`;
}