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
  { value: 'meeting_scheduled', label: 'פגישה נקבעה' },
  { value: 'completed', label: 'הושלם' },
  { value: 'cancelled', label: 'בוטל' },
  { value: 'followup_closed', label: 'פולו-אפ נסגר' },
  { value: 'closed_lost', label: 'נסגר — אבוד' },
];

export default function ServiceRequestTable({ requests, contacts, onEdit, onDelete, onStatusChange }) {
  const getContact = (id) => contacts.find(c => c.id === id);

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>שם לקוח</TableHead>
            <TableHead>טלפון</TableHead>
            <TableHead>סוג שירות</TableHead>
            <TableHead>סטטוס</TableHead>
            <TableHead>מקור</TableHead>
            <TableHead>תאריך</TableHead>
            <TableHead>פעולות</TableHead>
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
                  <TableCell>
                    <Link to={`/contacts/${req.contact_id}`} className="font-medium text-sm hover:text-primary hover:underline">
                      {contact?.full_name || '—'}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{contact?.phone || '—'}</TableCell>
                  <TableCell className="text-sm">{SERVICE_TYPE_LABELS[req.service_type] || req.service_type}</TableCell>
                  <TableCell>
                    <Select value={req.status} onValueChange={v => onStatusChange(req, v)}>
                      <SelectTrigger className="h-7 w-auto border-0 p-0">
                        <SRStatusBadge status={req.status} />
                      </SelectTrigger>
                      <SelectContent>
                        {SR_STATUS_OPTIONS.map(s => (
                          <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{SOURCE_LABELS[req.source] || req.source || '—'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {req.created_date ? format(new Date(req.created_date), 'dd/MM/yy') : '—'}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
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