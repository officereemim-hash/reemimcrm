import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Plus, Pencil, Save, Settings2, Link2, Clock, GitBranch } from 'lucide-react';

const CATEGORY_CONFIG = {
  details: { label: 'פרטים', icon: Settings2, color: 'bg-primary/10 text-primary' },
  links: { label: 'קישורים', icon: Link2, color: 'bg-accent/20 text-accent-foreground' },
  sla: { label: 'SLA זמנים', icon: Clock, color: 'bg-destructive/10 text-destructive' },
  flow: { label: 'הגדרות Flow', icon: GitBranch, color: 'bg-success/10 text-success' },
};

const VALUE_TYPES = [
  { value: 'text', label: 'טקסט' },
  { value: 'url', label: 'קישור' },
  { value: 'number', label: 'מספר' },
  { value: 'boolean', label: 'כן/לא' },
];

const EMPTY = { category: 'details', key: '', label: '', value: '', value_type: 'text' };

export default function SystemSettingsTab() {
  const [activeTab, setActiveTab] = useState('details');
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [inlineEdits, setInlineEdits] = useState({});
  const queryClient = useQueryClient();

  const { data: settings = [], isLoading } = useQuery({
    queryKey: ['system-settings'],
    queryFn: () => base44.entities.SystemSetting.list('category', 500),
  });

  const saveMutation = useMutation({
    mutationFn: data => editId ? base44.entities.SystemSetting.update(editId, data) : base44.entities.SystemSetting.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['system-settings'] }); setShowDialog(false); setEditId(null); },
  });

  const updateInlineMutation = useMutation({
    mutationFn: ({ id, value }) => base44.entities.SystemSetting.update(id, { value }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['system-settings'] });
      setInlineEdits(prev => { const next = { ...prev }; delete next[id]; return next; });
    },
  });

  const handleEdit = item => {
    setForm({ category: item.category, key: item.key, label: item.label || '', value: item.value || '', value_type: item.value_type || 'text' });
    setEditId(item.id);
    setShowDialog(true);
  };

  const filteredSettings = settings.filter(s => s.category === activeTab);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2 flex-wrap">
          {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => {
            const Icon = cfg.icon;
            const count = settings.filter(s => s.category === key).length;
            return (
              <Button key={key} variant={activeTab === key ? 'default' : 'outline'} size="sm" onClick={() => setActiveTab(key)} className="gap-2">
                <Icon size={14} />{cfg.label} ({count})
              </Button>
            );
          })}
        </div>
        <Button size="sm" onClick={() => { setForm({ ...EMPTY, category: activeTab }); setEditId(null); setShowDialog(true); }} className="gap-2">
          <Plus size={16} />הוסף הגדרה
        </Button>
      </div>

      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{CATEGORY_CONFIG[activeTab]?.label}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>
          ) : filteredSettings.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">אין הגדרות בקטגוריה זו</p>
          ) : (
            <div className="space-y-3">
              {filteredSettings.map(setting => (
                <div key={setting.id} className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/30 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm">{setting.label || setting.key}</span>
                      <Badge variant="outline" className="text-xs">{setting.key}</Badge>
                      <Badge variant="secondary" className="text-xs">{VALUE_TYPES.find(v => v.value === setting.value_type)?.label || setting.value_type}</Badge>
                    </div>
                    {setting.value_type === 'boolean' ? (
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={setting.value === 'true'}
                          onCheckedChange={checked => updateInlineMutation.mutate({ id: setting.id, value: checked ? 'true' : 'false' })}
                        />
                        <span className="text-xs text-muted-foreground">{setting.value === 'true' ? 'פעיל' : 'כבוי'}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Input
                          className="h-8 text-sm flex-1"
                          value={inlineEdits[setting.id] !== undefined ? inlineEdits[setting.id] : setting.value}
                          onChange={e => setInlineEdits(prev => ({ ...prev, [setting.id]: e.target.value }))}
                          dir={setting.value_type === 'url' || setting.value_type === 'number' ? 'ltr' : 'rtl'}
                        />
                        {inlineEdits[setting.id] !== undefined && (
                          <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => updateInlineMutation.mutate({ id: setting.id, value: inlineEdits[setting.id] })}>
                            <Save size={12} />שמור
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" onClick={() => handleEdit(setting)}><Pencil size={14} /></Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={() => setShowDialog(false)}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader><DialogTitle>{editId ? 'עריכת הגדרה' : 'הגדרה חדשה'}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>קטגוריה</Label>
                <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(CATEGORY_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>סוג ערך</Label>
                <Select value={form.value_type} onValueChange={v => setForm({ ...form, value_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{VALUE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1"><Label>מפתח *</Label><Input value={form.key} onChange={e => setForm({ ...form, key: e.target.value })} dir="ltr" /></div>
            <div className="space-y-1"><Label>תיאור</Label><Input value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} /></div>
            <div className="space-y-1"><Label>ערך</Label><Input value={form.value} onChange={e => setForm({ ...form, value: e.target.value })} dir={form.value_type === 'url' ? 'ltr' : 'rtl'} /></div>
          </div>
          <DialogFooter className="gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowDialog(false)}>ביטול</Button>
            <Button onClick={() => saveMutation.mutate(form)} disabled={!form.key || saveMutation.isPending}>{saveMutation.isPending ? 'שומר...' : 'שמור'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}