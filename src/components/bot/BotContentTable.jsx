import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Pencil, Trash2 } from 'lucide-react';

const CATEGORIES = { welcome: 'ברוכים הבאים', menu: 'תפריט', followup: 'פולו-אפ', reminder: 'תזכורת', closing: 'סגירה', error: 'שגיאה', escalation: 'הסלמה' };
const FLOWS = { retirement: 'פרישה', economic_feasibility: 'היתכנות כלכלית', investments: 'השקעות', divorce_split: 'גירושין', tax_advisory: 'ייעוץ מס', annual_service: 'שירות שנתי', webinar: 'וובינר', general: 'כללי' };

export default function BotContentTable({ items, onEdit, onDelete, selectedIds = [], onToggle, onToggleAll }) {
  const allSelected = items.length > 0 && selectedIds.length === items.length;

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            {onToggle && <TableHead className="w-10"><Checkbox checked={allSelected} onCheckedChange={() => onToggleAll(items)} /></TableHead>}
            <TableHead>מפתח</TableHead>
            <TableHead>כותרת</TableHead>
            <TableHead>קטגוריה</TableHead>
            <TableHead>מסלול</TableHead>
            <TableHead>סטטוס</TableHead>
            <TableHead>פעולות</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow><TableCell colSpan={onToggle ? 7 : 6} className="text-center py-8 text-muted-foreground">אין הודעות</TableCell></TableRow>
          ) : items.map(item => (
            <TableRow key={item.id} className="hover:bg-muted/30">
              {onToggle && <TableCell><Checkbox checked={selectedIds.includes(item.id)} onCheckedChange={() => onToggle(item.id)} /></TableCell>}
              <TableCell className="text-xs font-mono">{item.key}</TableCell>
              <TableCell className="text-sm font-medium">{item.title}</TableCell>
              <TableCell><Badge variant="secondary" className="text-xs">{CATEGORIES[item.category] || item.category}</Badge></TableCell>
              <TableCell className="text-xs">{FLOWS[item.service_type_flow] || '—'}</TableCell>
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