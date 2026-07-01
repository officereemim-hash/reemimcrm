import { Link } from 'react-router-dom';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { MeetingStatusBadge } from '@/components/StatusBadge';
import { Pencil, Trash2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';

const LOCATION_LABELS = { modiin: 'מודיעין', petah_tikva_wednesday: 'פ"ת (רביעי)', zoom: 'זום', phone: 'טלפון' };
const TYPE_LABELS = { intro_sale: 'שיחת היכרות', advisory: 'ייעוץ', annual_service: 'שירות שנתי', zoom: 'זום', followup: 'פולו-אפ' };

export default function MeetingsTable({ meetings, contacts, onEdit, onDelete, selectedIds = [], onToggle, onToggleAll }) {
  const getContact = id => contacts.find(c => c.id === id);
  const allSelected = meetings.length > 0 && selectedIds.length === meetings.length;

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="overflow-x-auto -mx-3 md:mx-0">
      <Table className="min-w-[720px]">
        <TableHeader>
          <TableRow>
            {onToggle && <TableHead className="w-10"><Checkbox checked={allSelected} onCheckedChange={() => onToggleAll(meetings)} /></TableHead>}
            <TableHead>תאריך ושעה</TableHead>
            <TableHead>שם לקוח</TableHead>
            <TableHead>סוג</TableHead>
            <TableHead>מיקום</TableHead>
            <TableHead>סטטוס</TableHead>
            <TableHead>צ׳ק ליסט</TableHead>
            <TableHead>פעולות</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {meetings.length === 0 ? (
            <TableRow><TableCell colSpan={onToggle ? 8 : 7} className="text-center py-8 text-muted-foreground">אין פגישות</TableCell></TableRow>
          ) : meetings.map(m => {
            const contact = getContact(m.contact_id);
            return (
              <TableRow key={m.id} className="hover:bg-muted/30">
                {onToggle && <TableCell><Checkbox checked={selectedIds.includes(m.id)} onCheckedChange={() => onToggle(m.id)} /></TableCell>}
                <TableCell className="text-sm font-medium">{m.scheduled_at ? format(parseISO(m.scheduled_at), 'dd/MM/yy HH:mm') : '—'}</TableCell>
                <TableCell>
                  <Link to={`/contacts/${m.contact_id}`} className="text-sm hover:text-primary hover:underline">{contact?.full_name || '—'}</Link>
                </TableCell>
                <TableCell className="text-sm">{TYPE_LABELS[m.type] || m.type}</TableCell>
                <TableCell className="text-sm">{LOCATION_LABELS[m.location] || m.location}</TableCell>
                <TableCell><MeetingStatusBadge status={m.status} /></TableCell>
                <TableCell className="text-xs">
                  {m.checklist_pre_completed ? <span className="text-success">✓</span> : <span className="text-destructive">✗</span>}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(m)}><Pencil size={14} /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDelete(m)}><Trash2 size={14} /></Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      </div>
    </div>
  );
}