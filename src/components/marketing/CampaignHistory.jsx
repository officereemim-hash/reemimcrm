import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Mail, MessageCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';

const STATUS_LABELS = {
  in_progress: { label: 'בתהליך', cls: 'bg-gold/20 text-gold' },
  completed: { label: 'הושלם', cls: 'bg-success/10 text-success' },
  partial: { label: 'חלקי', cls: 'bg-coral/20 text-coral' },
  failed: { label: 'נכשל', cls: 'bg-destructive/10 text-destructive' },
};

const QUEUE_STATUS_LABELS = {
  pending: 'ממתין',
  sent: 'נשלח',
  delivered: 'נמסר',
  opened: 'נפתח',
  clicked: 'הוקלק',
  bounced: 'חזר (bounce)',
  failed: 'נכשל',
  skipped: 'דולג',
};

export default function CampaignHistory() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [queueItems, setQueueItems] = useState({});

  useEffect(() => {
    base44.entities.Campaign.list('-created_date', 50).then(data => {
      setCampaigns(data || []);
      setLoading(false);
    });
  }, []);

  const toggleExpand = async (campaignId) => {
    if (expandedId === campaignId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(campaignId);
    if (!queueItems[campaignId]) {
      const items = await base44.entities.CampaignQueue.filter({ campaign_id: campaignId }, '-created_date', 200);
      setQueueItems(prev => ({ ...prev, [campaignId]: items }));
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-32">
      <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  );

  if (campaigns.length === 0) return (
    <p className="text-sm text-muted-foreground py-8 text-center">אין קמפיינים עדיין</p>
  );

  return (
    <div className="space-y-3">
      {campaigns.map(c => {
        const status = STATUS_LABELS[c.status] || { label: c.status, cls: 'bg-muted' };
        const isOpen = expandedId === c.id;
        return (
          <Card key={c.id} className="shadow-sm">
            <CardContent className="p-4">
              <button onClick={() => toggleExpand(c.id)} className="w-full text-right">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-semibold text-sm flex-1 min-w-[150px]">{c.name}</span>
                  <Badge className={status.cls}>{status.label}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {c.sent_at ? format(new Date(c.sent_at), 'dd/MM/yyyy HH:mm') : ''}
                  </span>
                  {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
                <div className="flex gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
                  <span>👥 {c.recipients_count || 0} נמענים</span>
                  {(c.channel === 'email' || c.channel === 'both') && (
                    <span className="flex items-center gap-1">
                      <Mail size={12} /> נשלחו {c.email_sent || 0} | נכשלו {c.email_failed || 0}
                    </span>
                  )}
                  {(c.channel === 'whatsapp' || c.channel === 'both') && (
                    <span className="flex items-center gap-1">
                      <MessageCircle size={12} /> נשלחו {c.whatsapp_sent || 0} | נכשלו {c.whatsapp_failed || 0}
                    </span>
                  )}
                  <span>📬 פתיחות: {c.opens_count || 0}</span>
                  <span>🔗 קליקים: {c.clicks_count || 0}</span>
                  {(c.bounces_count || 0) > 0 && <span>⚠️ חזרו: {c.bounces_count}</span>}
                </div>
              </button>

              {isOpen && (
                <div className="mt-3 pt-3 border-t space-y-1">
                  {!queueItems[c.id] ? (
                    <p className="text-xs text-muted-foreground">טוען...</p>
                  ) : queueItems[c.id].length === 0 ? (
                    <p className="text-xs text-muted-foreground">אין פירוט נמענים</p>
                  ) : (
                    queueItems[c.id].map(q => (
                      <div key={q.id} className="flex items-center gap-2 text-xs p-1.5 rounded hover:bg-muted/50 flex-wrap">
                        {q.channel === 'email' ? <Mail size={12} className="text-primary" /> : <MessageCircle size={12} className="text-success" />}
                        <span className="font-medium">{q.contact_name || '—'}</span>
                        <span className="text-muted-foreground flex-1 truncate" dir="ltr">{q.recipient}</span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {QUEUE_STATUS_LABELS[q.status] || q.status}
                        </Badge>
                        {q.error_message && <span className="text-muted-foreground w-full">{q.error_message}</span>}
                      </div>
                    ))
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}