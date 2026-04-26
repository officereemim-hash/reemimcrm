import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SRStatusBadge, SERVICE_TYPE_LABELS } from '@/components/StatusBadge';
import { format } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';

export default function ServiceRequestCard({ contactId, serviceRequests, onRefresh }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ service_type: '', status: 'new', source: 'manual', notes: '' });
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    setSaving(true);
    await base44.entities.ServiceRequest.create({ ...form, contact_id: contactId });
    setShowForm(false);
    setForm({ service_type: '', status: 'new', source: 'manual', notes: '' });
    onRefresh();
    setSaving(false);
  };

  const updateStatus = async (sr, newStatus) => {
    await base44.entities.ServiceRequest.update(sr.id, { status: newStatus });
    onRefresh();
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">פניות שירות</h3>
        <Button size="sm" onClick={() => setShowForm(true)} className="gap-1">
          <Plus size={14} />
          פנייה חדשה
        </Button>
      </div>

      {serviceRequests.length === 0 ? (
        <div className="text-center text-muted-foreground py-10 text-sm">אין פניות שירות</div>
      ) : (
        serviceRequests.map(sr => (
          <Card key={sr.id} className="border">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{SERVICE_TYPE_LABELS[sr.service_type] || sr.service_type}</span>
                  <SRStatusBadge status={sr.status} />
                </div>
                <div className="flex items-center gap-2">
                  {sr.quote_sent && <span className="text-xs bg-gold/20 text-gold px-2 py-0.5 rounded-full">הצעה נשלחה</span>}
                  {sr.documents_status === 'complete' && <span className="text-xs bg-success/20 text-success px-2 py-0.5 rounded-full">מסמכים מלאים</span>}
                </div>
              </div>
              {sr.followup_stage !== 'none' && (
                <div className="text-xs text-muted-foreground">שלב פולו-אפ: {sr.followup_stage}</div>
              )}
              {sr.notes && <p className="text-sm text-muted-foreground">{sr.notes}</p>}
              <div className="flex gap-2 flex-wrap pt-1">
                {sr.status === 'new' && (
                  <Button size="sm" variant="outline" onClick={() => updateStatus(sr, 'in_progress')}>העבר לטיפול</Button>
                )}
                {sr.status === 'in_progress' && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => updateStatus(sr, 'quote_sent')}>הצעה נשלחה</Button>
                    <Button size="sm" variant="outline" onClick={() => updateStatus(sr, 'meeting_scheduled')}>פגישה נקבעה</Button>
                  </>
                )}
                {sr.status === 'meeting_scheduled' && (
                  <Button size="sm" variant="outline" onClick={() => updateStatus(sr, 'completed')}>סמן כהושלם</Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))
      )}

      {showForm && (
        <Dialog open onOpenChange={() => setShowForm(false)}>
          <DialogContent dir="rtl">
            <DialogHeader>
              <DialogTitle>פנייה חדשה</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 mt-2">
              <div className="space-y-1">
                <Label>סוג שירות *</Label>
                <Select value={form.service_type} onValueChange={v => setForm(f => ({ ...f, service_type: v }))}>
                  <SelectTrigger><SelectValue placeholder="בחר..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="retirement">ייעוץ פרישה</SelectItem>
                    <SelectItem value="economic_feasibility">היתכנות כלכלית</SelectItem>
                    <SelectItem value="investments">השקעות</SelectItem>
                    <SelectItem value="divorce_split">איזון אקטוארי</SelectItem>
                    <SelectItem value="tax_advisory">ייעוץ מס</SelectItem>
                    <SelectItem value="annual_service_call">שיחת שירות שנתית</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>מקור</Label>
                <Select value={form.source} onValueChange={v => setForm(f => ({ ...f, source: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">ידני</SelectItem>
                    <SelectItem value="bot">בוט</SelectItem>
                    <SelectItem value="bar_call">שיחת בר</SelectItem>
                    <SelectItem value="webinar">וובינר</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>הערות</Label>
                <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowForm(false)}>ביטול</Button>
                <Button onClick={handleCreate} disabled={saving || !form.service_type}>
                  {saving ? 'שומר...' : 'צור פנייה'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}