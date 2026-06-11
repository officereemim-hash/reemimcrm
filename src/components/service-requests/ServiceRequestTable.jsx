import { Link } from 'react-router-dom';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SRStatusBadge, SERVICE_TYPE_LABELS, SOURCE_LABELS } from '@/components/StatusBadge';
import { Pencil, Trash2 } from 'lucide-react';
import { format } from 'date-fns';

const SR_STATUS_OPTIONS = [
  { value: 'new', label: 'חדש' },
  { value: 'in_progress', label: 'בטיפול' },
  { value: 'quote_sent', label: 'הצעה נשלחה' },
  { value: 'awaiting_client_decision', label: 'ממתין להחלטה' },
  { value: 'followup_active', label: 'פולו-אפ פעיל' },
  { value: 'phone_meeting', label: 'נקבעה שיחה טלפונית' },
  { value: 'meeting_scheduled', label: 'פגישה נקבעה' },
  { value: 'completed', label: 'הושלם' },
  { value: 'cancelled', label: 'בוטל' },
  { value: 'followup_closed', label: 'פולו-אפ נסגר' },
  { value: 'closed_lost', label: 'נסגר — אבוד' },
];

function extractReason(notes) {
  const match = String(notes || '').match(/סיבת הפניה:\s*(.+)/);
  return match ? match[1].trim() : null;
}

export default function ServiceRequestTable({ requests, contacts, onEdit, onDelete, onStatusChange }) {
  const getContact = (id) => contacts.find(c => c.id === id);

  return (
    <div className="border rounded-lg overflow-x-auto">
      <Table className="min-w-[900px] table-fixed" dir="rtl">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[22%] text-right">שם לקוח</TableHead>
            <TableHead className="w-[16%] text-right">טלפון</TableHead>
            <TableHead className="w-[18%] text-right">סוג שירות</TableHead>
            <TableHead className="w-[14%] text-center">סטטוס</TableHead>
            <TableHead className="w-[10%] text-right">מקור</TableHead>
            <TableHead className="w-[10%] text-right">תאריך</TableHead>
            <TableHead className="w-[10%] text-right">פעולות</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {requests.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">אין פניות</TableCell>
            </TableRow>
          ) : (
            requests.map(req => {
              const contact = getContact(req.contact_id);
              return (
                <TableRow key={req.id} className="hover:bg-muted/30">
                  <TableCell className="text-right align-middle">
                    <Link to={`/service-requests/${req.id}`} className="font-medium text-sm hover:text-primary hover:underline">
                      {contact?.full_name || req.contact_name || '—'}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right align-middle text-sm text-muted-foreground">{contact?.phone || req.contact_phone || '—'}</TableCell>
                  <TableCell className="text-right align-middle text-sm">{SERVICE_TYPE_LABELS[req.service_type] || req.service_type || extractReason(req.notes) || '—'}</TableCell>
                  <TableCell className="text-center align-middle">
                    <div className="flex justify-center">
                      <Select value={req.status} onValueChange={v => onStatusChange(req, v)}>
                        <SelectTrigger className="h-7 w-[86px] border-0 bg-transparent p-0 justify-center gap-1 shadow-none hover:bg-transparent [&>svg]:h-3 [&>svg]:w-3">
                          <SRStatusBadge status={req.status} />
                        </SelectTrigger>
                        <SelectContent>
                          {SR_STATUS_OPTIONS.map(s => (
                            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </TableCell>
                  <TableCell className="text-right align-middle text-xs text-muted-foreground">{SOURCE_LABELS[req.source] || req.source || '—'}</TableCell>
                  <TableCell className="text-right align-middle text-xs text-muted-foreground">
                    {req.created_date ? format(new Date(req.created_date), 'dd/MM/yy') : '—'}
                  </TableCell>
                  <TableCell className="text-right align-middle">
                    <div className="flex gap-1 justify-start">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(req)}>
                        <Pencil size={14} />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDelete(req)}>
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}