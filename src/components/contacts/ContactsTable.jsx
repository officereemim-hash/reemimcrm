import { Link } from 'react-router-dom';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ContactStatusBadge, BotStatusBadge, SERVICE_TYPE_LABELS, SOURCE_LABELS } from '@/components/StatusBadge';
import { Checkbox } from '@/components/ui/checkbox';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';

export default function ContactsTable({ contacts, selectedIds, onToggleSelect, onToggleAll, onDelete }) {
  const allSelected = contacts.length > 0 && selectedIds.length === contacts.length;
  const someSelected = selectedIds.length > 0 && selectedIds.length < contacts.length;

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Checkbox
                checked={allSelected}
                indeterminate={someSelected}
                onCheckedChange={() => onToggleAll()}
              />
            </TableHead>
            <TableHead>שם מלא</TableHead>
            <TableHead>טלפון</TableHead>
            <TableHead>מייל</TableHead>
            <TableHead>סטטוס</TableHead>
            <TableHead>סטטוס בוט</TableHead>
            <TableHead>סוג שירות</TableHead>
            <TableHead>מקור</TableHead>
            <TableHead>מטפל/ת</TableHead>
            <TableHead>תאריך</TableHead>
            <TableHead className="w-10"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {contacts.length === 0 ? (
            <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">לא נמצאו אנשי קשר</TableCell></TableRow>
          ) : contacts.map(c => (
            <TableRow key={c.id} className={`hover:bg-muted/30 ${selectedIds.includes(c.id) ? 'bg-primary/5' : ''}`}>
              <TableCell>
                <Checkbox
                  checked={selectedIds.includes(c.id)}
                  onCheckedChange={() => onToggleSelect(c.id)}
                />
              </TableCell>
              <TableCell>
                <Link to={`/contacts/${c.id}`} className="font-medium text-sm hover:text-primary hover:underline">
                  {c.full_name}
                </Link>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">{c.phone || '—'}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{c.email || '—'}</TableCell>
              <TableCell><ContactStatusBadge status={c.status} /></TableCell>
              <TableCell><BotStatusBadge status={c.bot_status} /></TableCell>
              <TableCell className="text-xs">{SERVICE_TYPE_LABELS[c.service_type] || '—'}</TableCell>
              <TableCell className="text-xs">{SOURCE_LABELS[c.source] || '—'}</TableCell>
              <TableCell className="text-xs">{c.assigned_to || '—'}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{c.created_date ? format(new Date(c.created_date), 'dd/MM/yy') : '—'}</TableCell>
              <TableCell>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => onDelete([c.id])}>
                  <Trash2 size={14} />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}