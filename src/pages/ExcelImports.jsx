import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Upload, CheckCircle, AlertCircle, Clock, Loader } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { format } from 'date-fns';

const STATUS_ICONS = {
  pending: Clock,
  processing: Loader,
  completed: CheckCircle,
  failed: AlertCircle,
};

const STATUS_LABELS = {
  pending: 'ממתין',
  processing: 'מעבד',
  completed: 'הושלם',
  failed: 'נכשל',
};

const TYPE_LABELS = {
  service_meeting: 'שיחת שירות',
  retirement_interest: 'עניין בפרישה',
  divorce_interest: 'עניין בגירושין',
  general_data: 'נתונים כלליים',
};

export default function ExcelImports() {
  const [imports, setImports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ import_type: 'general_data', assigned_to: 'bar' });
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = () => {
    base44.entities.ExcelImport.list('-created_date', 100).then(data => {
      setImports(data);
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, []);

  const handleImport = async () => {
    if (!file) return;
    setSaving(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    await base44.entities.ExcelImport.create({ ...form, file_url, status: 'pending' });
    setShowForm(false);
    setFile(null);
    load();
    setSaving(false);
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">ייבוא אקסלים</h1>
        <Button onClick={() => setShowForm(true)} className="gap-2">
          <Upload size={16} />
          ייבוא חדש
        </Button>
      </div>

      {imports.length === 0 ? (
        <div className="text-center text-muted-foreground py-16">אין ייבואים</div>
      ) : (
        <div className="space-y-2">
          {imports.map(imp => {
            const Icon = STATUS_ICONS[imp.status] || Clock;
            const isError = imp.status === 'failed';
            return (
              <Card key={imp.id} className={isError ? 'border-destructive/30' : ''}>
                <CardContent className="p-4 flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                    imp.status === 'completed' ? 'bg-success/10' :
                    isError ? 'bg-destructive/10' : 'bg-muted'
                  }`}>
                    <Icon size={18} className={
                      imp.status === 'completed' ? 'text-success' :
                      isError ? 'text-destructive' : 'text-muted-foreground'
                    } />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{TYPE_LABELS[imp.import_type]}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        imp.status === 'completed' ? 'bg-success/10 text-success' :
                        isError ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'
                      }`}>
                        {STATUS_LABELS[imp.status]}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 flex gap-3">
                      {imp.imported_count > 0 && <span>✓ {imp.imported_count} יובאו</span>}
                      {imp.failed_count > 0 && <span className="text-destructive">✗ {imp.failed_count} נכשלו</span>}
                      {imp.assigned_to && <span>→ {imp.assigned_to}</span>}
                      {imp.created_date && <span>{format(new Date(imp.created_date), 'dd/MM/yyyy HH:mm')}</span>}
                    </div>
                    {imp.notes && <p className="text-xs text-muted-foreground mt-1">{imp.notes}</p>}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {showForm && (
        <Dialog open onOpenChange={() => setShowForm(false)}>
          <DialogContent dir="rtl">
            <DialogHeader><DialogTitle>ייבוא אקסל חדש</DialogTitle></DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-1">
                <Label>סוג ייבוא *</Label>
                <Select value={form.import_type} onValueChange={v => setForm(f => ({ ...f, import_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TYPE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>שיוך לידים</Label>
                <Select value={form.assigned_to} onValueChange={v => setForm(f => ({ ...f, assigned_to: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bar">בר (מכירות)</SelectItem>
                    <SelectItem value="yael">יעל (שירות)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>קובץ אקסל *</Label>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={e => setFile(e.target.files[0])}
                  className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-white hover:file:bg-primary/90"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowForm(false)}>ביטול</Button>
                <Button onClick={handleImport} disabled={saving || !file}>
                  {saving ? 'מעלה...' : 'התחל ייבוא'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}