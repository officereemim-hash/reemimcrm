import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Pencil, Trash2 } from 'lucide-react';
import { CONTENT_TYPES, SERVICE_TYPES } from '@/components/bot/ServiceContentFormDialog';

export default function ServiceContentTable({ items, onEdit, onDelete }) {
  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>שם</TableHead>
            <TableHead>סוג תוכן</TableHead>
            <TableHead>שירות</TableHead>
            <TableHead>קישור</TableHead>
            <TableHead>סטטוס</TableHead>
            <TableHead>פעולות</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">אין תוכן</TableCell></TableRow>
          ) : items.map(item => (
            <TableRow key={item.id} className="hover:bg-muted/30">
              <TableCell className="text-sm font-medium">{item.title}</TableCell>
              <TableCell><Badge variant="secondary" className="text-xs">{CONTENT_TYPES.find(t => t.value === item.content_type)?.label || item.content_type}</Badge></TableCell>
              <TableCell className="text-xs">{SERVICE_TYPES.find(s => s.value === item.service_type)?.label || item.service_type}</TableCell>
              <TableCell className="text-xs text-primary/70 max-w-[200px] truncate" dir="ltr">{item.url || '—'}</TableCell>
              <TableCell>{item.is_active !== false ? <Badge className="text-xs bg-success/20 text-success">פעיל</Badge> : <Badge variant="outline" className="text-xs">לא פעיל</Badge>}</TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(item)}><Pencil size={14} /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDelete(item)}><Trash2 size={14} /></Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}