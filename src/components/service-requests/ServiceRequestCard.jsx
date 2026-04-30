import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SRStatusBadge, SERVICE_TYPE_LABELS } from '@/components/StatusBadge';
import { Pencil, Trash2, Phone } from 'lucide-react';
import { format } from 'date-fns';

export default function ServiceRequestCard({ request, contact, onEdit, onDelete }) {
  return (
    <Card className="hover:shadow-md transition-all hover:border-primary/30">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <Link to={`/contacts/${request.contact_id}`} className="font-semibold text-sm hover:text-primary hover:underline">
              {contact?.full_name || '—'}
            </Link>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <SRStatusBadge status={request.status} />
              <span className="text-xs text-muted-foreground">{SERVICE_TYPE_LABELS[request.service_type]}</span>
            </div>
            <div className="text-xs text-muted-foreground mt-2 flex gap-3 flex-wrap">
              {contact?.phone && (
                <span className="flex items-center gap-1"><Phone size={10} />{contact.phone}</span>
              )}
              {request.quote_sent && <span>✓ הצעה נשלחה</span>}
              {request.followup_stage && request.followup_stage !== 'none' && <span>פולו-אפ: {request.followup_stage}</span>}
              {request.updated_date && <span>עדכון: {format(new Date(request.updated_date), 'dd/MM/yy')}</span>}
            </div>
            {request.notes && <p className="text-xs text-muted-foreground mt-1 truncate">{request.notes}</p>}
          </div>
          <div className="flex gap-1 flex-shrink-0">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(request)}>
              <Pencil size={14} />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDelete(request)}>
              <Trash2 size={14} />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}