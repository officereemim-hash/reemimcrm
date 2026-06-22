import { Link } from 'react-router-dom';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { TaskStatusBadge, PriorityBadge } from '@/components/StatusBadge';
import { Pencil, Trash2, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';

const TYPE_LABELS = {
  followup: 'פולו-אפ', pre_meeting_checklist: 'צ׳ק לפני פגישה', post_meeting_checklist: 'צ׳ק אחרי פגישה',
  document_collection: 'איסוף מסמכים', shoranss_transfer: 'העברה לשורנס', annual_followup: 'פולו-אפ שנתי',
  sla_followup: 'מעקב SLA', no_response_escalation: 'הסלמה',
};

export default function TasksTable({ tasks, contacts, onEdit, onDelete, onMarkDone, selectedIds = [], onToggle, onToggleAll }) {
  const getContact = id => contacts.find(c => c.id === id);
  const allSelected = tasks.length > 0 && selectedIds.length === tasks.length;

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            {onToggle && <TableHead className="w-10"><Checkbox checked={allSelected} onCheckedChange={() => onToggleAll(tasks)} /></TableHead>}
            <TableHead className="w-10"></TableHead>
            <TableHead>משימה</TableHead>
            <TableHead>איש קשר</TableHead>
            <TableHead>סוג</TableHead>
            <TableHead>עדיפות</TableHead>
            <TableHead>סטטוס</TableHead>
            <TableHead>יעד</TableHead>
            <TableHead>הקצאה</TableHead>
            <TableHead>פעולות</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.length === 0 ? (
            <TableRow><TableCell colSpan={onToggle ? 10 : 9} className="text-center py-8 text-muted-foreground">אין משימות</TableCell></TableRow>
          ) : tasks.map(t => {
            const contact = getContact(t.contact_id);
            return (
              <TableRow key={t.id} className={`hover:bg-muted/30 ${t.status === 'done' ? 'opacity-50' : ''}`}>
                {onToggle && <TableCell><Checkbox checked={selectedIds.includes(t.id)} onCheckedChange={() => onToggle(t.id)} /></TableCell>}
                <TableCell>
                  {t.status !== 'done' && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-success" onClick={() => onMarkDone(t)}>
                      <CheckCircle2 size={16} />
                    </Button>
                  )}
                </TableCell>
                <TableCell className="text-sm font-medium">{t.title}</TableCell>
                <TableCell>
                  {contact ? <Link to={`/contacts/${t.contact_id}`} className="text-sm hover:text-primary hover:underline">{contact.full_name}</Link> : '—'}
                </TableCell>
                <TableCell className="text-xs">{TYPE_LABELS[t.type] || t.type}</TableCell>
                <TableCell><PriorityBadge priority={t.priority} /></TableCell>
                <TableCell><TaskStatusBadge status={t.status} /></TableCell>
                <TableCell className="text-xs text-muted-foreground">{t.due_date ? format(new Date(t.due_date), 'dd/MM/yy') : '—'}</TableCell>
                <TableCell className="text-xs">{t.assigned_to || '—'}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(t)}><Pencil size={14} /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDelete(t)}><Trash2 size={14} /></Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}