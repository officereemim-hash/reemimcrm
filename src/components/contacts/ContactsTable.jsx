import { Link } from 'react-router-dom';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ContactStatusBadge, BotStatusBadge, SERVICE_TYPE_LABELS, SOURCE_LABELS } from '@/components/StatusBadge';
import { format } from 'date-fns';

export default function ContactsTable({ contacts }) {
  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>שם מלא</TableHead>
            <TableHead>טלפון</TableHead>
            <TableHead>מייל</TableHead>
            <TableHead>סטטוס</TableHead>
            <TableHead>סטטוס בוט</TableHead>
            <TableHead>סוג שירות</TableHead>
            <TableHead>מקור</TableHead>
            <TableHead>מטפל/ת</TableHead>
            <TableHead>תאריך</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {contacts.length === 0 ? (
            <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">לא נמצאו אנשי קשר</TableCell></TableRow>
          ) : contacts.map(c => (
            <TableRow key={c.id} className="hover:bg-muted/30">
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
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}