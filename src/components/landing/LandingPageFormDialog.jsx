import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Image as ImageIcon } from 'lucide-react';
import EmailBlockEditor from '@/components/marketing/EmailBlockEditor';

const TYPE_OPTIONS = [
  { value: 'investments', label: 'השקעות' },
  { value: 'divorce', label: 'גירושין / איזון' },
  { value: 'retirement', label: 'פרישה' },
];

const EMPTY = {
  slug: '', webinar_type: 'retirement', is_active: true, webinar_date: '',
  hero_title: '', hero_subtitle: '', hero_image_url: '', hero_image_fit: 'cover', hero_image_position: 'center',
  speaker_name: '', speaker_title: '', speaker_image_url: '', speaker_image_fit: 'cover',
  blocks: [], form_title: 'הרשמה לוובינר', form_button_text: 'הרשמה לוובינר',
  success_message: '', primary_color: '#4B2E83', accent_color: '#D4A53C',
};

export default function LandingPageFormDialog({ open, onClose, onSave, editItem }) {
  const [form, setForm] = useState(EMPTY);
  const [uploading, setUploading] = useState(null);

  useEffect(() => {
    if (editItem) {
      setForm({
        ...EMPTY, ...editItem,
        webinar_date: editItem.webinar_date ? editItem.webinar_date.slice(0, 16) : '',
        blocks: editItem.blocks || [],
      });
    } else {
      setForm(EMPTY);
    }
  }, [editItem, open]);

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const uploadImage = async (field, file) => {
    if (!file) return;
    setUploading(field);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    set(field, file_url);
    setUploading(null);
  };

  const handleSubmit = () => {
    if (!form.slug.trim()) return;
    const payload = {
      ...form,
      webinar_date: form.webinar_date ? new Date(form.webinar_date).toISOString() : undefined,
    };
    onSave(payload);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editItem ? 'עריכת דף נחיתה' : 'דף נחיתה חדש'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>כתובת (slug)</Label>
              <Input value={form.slug} onChange={e => set('slug', e.target.value)} placeholder="retirement" dir="ltr" />
              <p className="text-xs text-muted-foreground mt-1">הכתובת: /webinar/{form.slug || '...'}</p>
            </div>
            <div>
              <Label>סוג וובינר</Label>
              <Select value={form.webinar_type} onValueChange={v => set('webinar_type', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 items-center">
            <div>
              <Label>מועד הוובינר</Label>
              <Input type="datetime-local" value={form.webinar_date} onChange={e => set('webinar_date', e.target.value)} />
            </div>
            <div className="flex items-center gap-2 pt-5">
              <Switch checked={form.is_active} onCheckedChange={v => set('is_active', v)} />
              <Label>דף פעיל</Label>
            </div>
          </div>

          <div>
            <Label>כותרת ראשית</Label>
            <Input value={form.hero_title} onChange={e => set('hero_title', e.target.value)} />
          </div>
          <div>
            <Label>כותרת משנה</Label>
            <Textarea value={form.hero_subtitle} onChange={e => set('hero_subtitle', e.target.value)} rows={2} />
          </div>

          <ImageField label="תמונת באנר" field="hero_image_url" fitField="hero_image_fit" positionField="hero_image_position" form={form} uploading={uploading} onUpload={uploadImage} onClear={set} onSet={set} />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>שם המרצה</Label>
              <Input value={form.speaker_name} onChange={e => set('speaker_name', e.target.value)} />
            </div>
            <div>
              <Label>תפקיד המרצה</Label>
              <Input value={form.speaker_title} onChange={e => set('speaker_title', e.target.value)} />
            </div>
          </div>
          <ImageField label="תמונת המרצה" field="speaker_image_url" fitField="speaker_image_fit" form={form} uploading={uploading} onUpload={uploadImage} onClear={set} onSet={set} />

          <div>
            <Label className="mb-2 block">בלוקי תוכן</Label>
            <EmailBlockEditor blocks={form.blocks} onChange={b => set('blocks', b)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>כותרת הטופס</Label>
              <Input value={form.form_title} onChange={e => set('form_title', e.target.value)} />
            </div>
            <div>
              <Label>טקסט כפתור ההרשמה</Label>
              <Input value={form.form_button_text} onChange={e => set('form_button_text', e.target.value)} />
            </div>
          </div>
          <div>
            <Label>הודעת תודה (אחרי הרשמה)</Label>
            <Textarea value={form.success_message} onChange={e => set('success_message', e.target.value)} rows={2} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>צבע ראשי</Label>
              <Input type="color" value={form.primary_color} onChange={e => set('primary_color', e.target.value)} className="h-10 p-1" />
            </div>
            <div>
              <Label>צבע משני</Label>
              <Input type="color" value={form.accent_color} onChange={e => set('accent_color', e.target.value)} className="h-10 p-1" />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>ביטול</Button>
          <Button onClick={handleSubmit}>שמירה</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImageField({ label, field, fitField, positionField, form, uploading, onUpload, onClear, onSet }) {
  const fit = form[fitField] || 'cover';
  const position = (positionField && form[positionField]) || 'center';
  const POS_OPTIONS = [{ v: 'top', l: 'חלק עליון' }, { v: 'center', l: 'מרכז' }, { v: 'bottom', l: 'חלק תחתון' }];
  return (
    <div>
      <Label>{label}</Label>
      {form[field] ? (
        <div className="mt-1 space-y-2">
          <div className="relative bg-muted/40 rounded-lg overflow-hidden">
            <img src={form[field]} alt={label} className={`w-full h-40 ${fit === 'contain' ? 'object-contain' : 'object-cover'} rounded-lg`}
              style={fit === 'cover' ? { objectPosition: `center ${position}` } : undefined} />
            <button type="button" onClick={() => onClear(field, '')}
              className="absolute top-1 left-1 bg-destructive text-white rounded-full px-2 py-0.5 text-xs">הסר</button>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground ml-1">תצוגה:</span>
            <button type="button" onClick={() => onSet(fitField, 'cover')}
              className={`text-xs px-2 py-1 rounded border ${fit === 'cover' ? 'bg-primary text-white border-primary' : 'border-border hover:bg-muted'}`}>מילוי (חיתוך)</button>
            <button type="button" onClick={() => onSet(fitField, 'contain')}
              className={`text-xs px-2 py-1 rounded border ${fit === 'contain' ? 'bg-primary text-white border-primary' : 'border-border hover:bg-muted'}`}>תמונה מלאה</button>
          </div>
          {positionField && fit === 'cover' && (
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground ml-1">מיקום (כדי שהראש לא ייחתך):</span>
              {POS_OPTIONS.map(o => (
                <button key={o.v} type="button" onClick={() => onSet(positionField, o.v)}
                  className={`text-xs px-2 py-1 rounded border ${position === o.v ? 'bg-primary text-white border-primary' : 'border-border hover:bg-muted'}`}>{o.l}</button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex gap-2 mt-1">
          <Input value="" onChange={e => onSet(field, e.target.value)} placeholder="הדביקו קישור לתמונה או העלו →" dir="ltr" className="flex-1 text-sm" />
          <label className="px-3 flex items-center justify-center gap-1.5 bg-primary text-primary-foreground rounded-lg cursor-pointer hover:bg-primary/90 text-sm whitespace-nowrap">
            {uploading === field ? <Loader2 size={16} className="animate-spin" /> : <ImageIcon size={16} />}
            העלאה
            <input type="file" accept="image/*" className="hidden" onChange={e => onUpload(field, e.target.files[0])} />
          </label>
        </div>
      )}
    </div>
  );
}