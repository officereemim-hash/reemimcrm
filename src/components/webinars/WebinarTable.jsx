import { Link } from 'react-router-dom';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Pencil, Trash2, Check, X } from 'lucide-react';
import { format } from 'date-fns';

const TYPE_LABELS = { investments: 'השקעות', divorce: 'גירושין', retirement: 'פרישה' };

function BoolIcon({ value }) {
  return value ? <Check size={14} className="text-success" /> : <X size={14} className="text-muted-foreground" />;
}

export default function WebinarTable({ registrations, contacts, onEdit, onDelete, selectedIds, onSelectionChange }) {
  const getContact = id => contacts.find(c => c.id === id);

  const allSelected = registrations.length > 0 && registrations.every(r => selectedIds.has(r.id));
  const someSelected = registrations.some(r => selectedIds.has(r.id)) && !allSelected;

  const toggleAll = () => {
    if (allSelected) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(registrations.map(r => r.id)));
    }
  };

  const toggleOne = (id) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    onSelectionChange(next);
  };

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="overflow-x-auto -mx-3 md:mx-0">
      <Table className="min-w-[720px]">
        <TableHeader>
          <TableRow>
            <TableHead className="w-10 text-center">
              <Checkbox checked={allSelected} indeterminate={someSelected} onCheckedChange={toggleAll} />
            </TableHead>
            <TableHead>שם</TableHead>
            <TableHead>טלפון</TableHead>
            <TableHead>סוג</TableHead>
            <TableHead>תאריך יצירה</TableHead>
            <TableHead>תאריך וובינר</TableHead>
            <TableHead className="text-center">השתתף</TableHead>
            <TableHead className="text-center">שילם</TableHead>
            <TableHead className="text-center">פגישה</TableHead>
            <TableHead>פעולות</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {registrations.length === 0 ? (
            <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">אין רשומות</TableCell></TableRow>
          ) : registrations.map(reg => {
            const contact = getContact(reg.contact_id);
            return (
              <TableRow key={reg.id} className={`hover:bg-muted/30 ${selectedIds.has(reg.id) ? 'bg-primary/5' : ''}`}>
                <TableCell className="text-center">
                  <Checkbox checked={selectedIds.has(reg.id)} onCheckedChange={() => toggleOne(reg.id)} />
                </TableCell>
                <TableCell>
                  <Link to={`/contacts/${reg.contact_id}`} className="text-sm font-medium hover:text-primary hover:underline">
                    {contact?.full_name || '—'}
                  </Link>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{contact?.phone || '—'}</TableCell>
                <TableCell>
                  <span className="text-xs bg-gold/20 text-gold px-2 py-0.5 rounded-full">{TYPE_LABELS[reg.webinar_type]}</span>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{reg.created_date ? format(new Date(reg.created_date), 'dd/MM/yy') : '—'}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{reg.webinar_date ? format(new Date(reg.webinar_date), 'dd/MM/yy') : '—'}</TableCell>
                <TableCell className="text-center"><BoolIcon value={reg.attended} /></TableCell>
                <TableCell className="text-center"><BoolIcon value={reg.payment_completed} /></TableCell>
                <TableCell className="text-center"><BoolIcon value={reg.meeting_scheduled} /></TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(reg)}><Pencil size={14} /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDelete(reg)}><Trash2 size={14} /></Button>
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