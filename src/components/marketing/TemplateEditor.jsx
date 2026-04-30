import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Save, Eye, Loader2, MessageCircle, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import EmailBlockEditor from './EmailBlockEditor';
import EmailPreview from './EmailPreview';
import EmojiPicker from './EmojiPicker';

const TEMPLATE_TYPES = [
  { key: 'newsletter', label: 'ניוזלטר תקופתי' },
  { key: 'birthday', label: 'ברכת יום הולדת' },
  { key: 'google_review', label: 'בקשת המלצה (Google)' },
  { key: 'followup_after_meeting', label: 'פולו-אפ אחרי פגישה' },
  { key: 'annual_reminder', label: 'תזכורת שנתית' },
];

const DEFAULT_TEMPLATE = {
  header_title: 'קרנות ראמים',
  greeting: 'שלום {שם},',
  intro_text: '',
  blocks: [{ id: 1, type: 'text', title: '', content: '', button_text: '', button_url: '', image_url: '' }],
  whatsapp_message: '',
  contact_phone: '',
  contact_email: '',
  logo_url: '',
  subject: '',
};

export default function TemplateEditor() {
  const [templates, setTemplates] = useState([]);
  const [selectedType, setSelectedType] = useState('newsletter');
  const [template, setTemplate] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showPreview, setShowPreview] = useState(false);
  const [waRef, setWaRef] = useState(null);

  useEffect(() => {
    loadTemplates();
  }, []);

  useEffect(() => {
    const found = templates.find(t => t.type === selectedType);
    if (found) {
      setTemplate(found);
    } else {
      setTemplate({ ...DEFAULT_TEMPLATE, type: selectedType, name: TEMPLATE_TYPES.find(t => t.key === selectedType)?.label || '' });
    }
  }, [selectedType, templates]);

  const loadTemplates = async () => {
    const data = await base44.entities.MessageTemplate.list();
    setTemplates(data || []);
    setLoading(false);
  };

  const handleSave = async () => {
    if (!template) return;
    setSaving(true);
    if (template.id) {
      await base44.entities.MessageTemplate.update(template.id, template);
    } else {
      const created = await base44.entities.MessageTemplate.create(template);
      setTemplate(created);
    }
    await loadTemplates();
    setSaving(false);
  };

  const updateField = (field, value) => {
    setTemplate(t => ({ ...t, [field]: value }));
  };

  const insertEmojiToWA = (emoji) => {
    const ta = waRef;
    if (ta) {
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const current = template.whatsapp_message || '';
      const newVal = current.slice(0, start) + emoji + current.slice(end);
      updateField('whatsapp_message', newVal);
      setTimeout(() => { ta.focus(); ta.setSelectionRange(start + emoji.length, start + emoji.length); }, 0);
    } else {
      updateField('whatsapp_message', (template.whatsapp_message || '') + emoji);
    }
  };

  if (loading) return (
    <div className="flex justify-center py-8">
      <Loader2 size={20} className="animate-spin text-primary" />
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Template type selector */}
      <div className="flex gap-2 flex-wrap">
        {TEMPLATE_TYPES.map(t => (
          <button
            key={t.key}
            onClick={() => setSelectedType(t.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              selectedType === t.key
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {template && (
        <div className="grid lg:grid-cols-2 gap-4">
          {/* Email section */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Mail size={16} className="text-primary" />
                תבנית מייל
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">נושא מייל</Label>
                <Input
                  value={template.subject || ''}
                  onChange={e => updateField('subject', e.target.value)}
                  placeholder="נושא המייל..."
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">כותרת עליונה</Label>
                <Input
                  value={template.header_title || ''}
                  onChange={e => updateField('header_title', e.target.value)}
                  placeholder="קרנות ראמים"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">ברכת פתיחה</Label>
                  <Input
                    value={template.greeting || ''}
                    onChange={e => updateField('greeting', e.target.value)}
                    placeholder="שלום {שם},"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">לוגו (URL)</Label>
                  <Input
                    value={template.logo_url || ''}
                    onChange={e => updateField('logo_url', e.target.value)}
                    placeholder="https://..."
                    dir="ltr"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">טקסט פתיחה</Label>
                <Textarea
                  value={template.intro_text || ''}
                  onChange={e => updateField('intro_text', e.target.value)}
                  rows={2}
                  placeholder="היי {שם}, שמח לעדכן אותך..."
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">בלוקי תוכן</Label>
                <EmailBlockEditor
                  blocks={template.blocks || []}
                  onChange={blocks => updateField('blocks', blocks)}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">טלפון קשר (פוטר)</Label>
                  <Input
                    value={template.contact_phone || ''}
                    onChange={e => updateField('contact_phone', e.target.value)}
                    placeholder="050-1234567"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">מייל קשר (פוטר)</Label>
                  <Input
                    value={template.contact_email || ''}
                    onChange={e => updateField('contact_email', e.target.value)}
                    placeholder="info@example.com"
                    dir="ltr"
                  />
                </div>
              </div>

              <Button onClick={() => setShowPreview(true)} variant="outline" size="sm" className="gap-1">
                <Eye size={14} />
                תצוגה מקדימה
              </Button>
            </CardContent>
          </Card>

          {/* WhatsApp section */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <MessageCircle size={16} className="text-success" />
                הודעת WhatsApp
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">תוכן ההודעה</Label>
                  <EmojiPicker onSelect={insertEmojiToWA} />
                </div>
                <Textarea
                  ref={el => setWaRef(el)}
                  value={template.whatsapp_message || ''}
                  onChange={e => updateField('whatsapp_message', e.target.value)}
                  rows={8}
                  placeholder="היי {שם} 👋&#10;&#10;רצינו לעדכן אותך ש..."
                />
                <p className="text-xs text-muted-foreground">
                  השתמש ב-&#123;שם&#125; לשם פרסונלי. לחצי על 😊 להוספת אימוג׳י.
                </p>
              </div>

              {/* WA Preview */}
              {template.whatsapp_message && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">תצוגה מקדימה</Label>
                  <div className="bg-[#E8F5E9] rounded-xl p-3 text-sm whitespace-pre-wrap leading-relaxed border border-[#C8E6C9]">
                    {(template.whatsapp_message || '').replace(/\{שם\}/g, 'ישראל ישראלי')}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Save button */}
      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          שמור תבנית
        </Button>
      </div>

      {/* Email Preview Dialog */}
      <EmailPreview
        open={showPreview}
        onClose={() => setShowPreview(false)}
        template={template}
      />
    </div>
  );
}