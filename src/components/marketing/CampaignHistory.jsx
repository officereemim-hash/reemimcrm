import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Mail, MessageCircle, ChevronDown, ChevronUp, Eye, Send, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { format } from 'date-fns';
import CampaignPreviewDialog from './CampaignPreviewDialog';
import BulkDeleteBar from '@/components/shared/BulkDeleteBar';

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
  const [previewCampaign, setPreviewCampaign] = useState(null);
  const [resendingId, setResendingId] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const handleResend = async (c) => {
    if (!confirm(`לשלוח מחדש את "${c.name}" ל-${c.recipients_count || 0} נמענים?`)) return;
    setResendingId(c.id);
    try {
      const legacyWaOnly = c.channel === 'whatsapp' && !c.whatsapp_snapshot;
      const emailHtml = legacyWaOnly ? '' : (c.content_snapshot || '');
      const waText = c.whatsapp_snapshot || (legacyWaOnly ? c.content_snapshot : '');

      // לקמפיין לנמען בודד — שולפים את אנשי הקשר מהתור המקורי
      let contactIds;
      if (c.audience === 'single') {
        const items = queueItems[c.id] || await base44.entities.CampaignQueue.filter({ campaign_id: c.id }, '-created_date', 200);
        contactIds = [...new Set(items.map(q => q.contact_id).filter(Boolean))];
      }

      const res = await base44.functions.invoke('sendCampaign', {
        type: c.type,
        channel: c.channel,
        audience: c.audience,
        contact_ids: contactIds,
        subject: c.subject || '',
        email_html: emailHtml,
        whatsapp_message: waText,
        campaign_name: `${c.name} (שליחה חוזרת)`,
      });
      const data = res?.data || res;
      if (data?.error) throw new Error(data.error);
      alert('הקמפיין נשלח מחדש בהצלחה ✅');
      const fresh = await base44.entities.Campaign.list('-created_date', 50);
      setCampaigns(fresh || []);
    } catch (err) {
      alert('שגיאה בשליחה מחדש: ' + (err?.response?.data?.error || err.message));
    }
    setResendingId(null);
  };

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

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    for (const id of selectedIds) await base44.entities.Campaign.delete(id);
    setSelectedIds([]); setBulkDeleting(false);
    const fresh = await base44.entities.Campaign.list('-created_date', 50);
    setCampaigns(fresh || []);
  };

  return (
    <div className="space-y-3">
      <BulkDeleteBar count={selectedIds.length} label="קמפיינים" deleting={bulkDeleting} onDelete={handleBulkDelete} />
      {campaigns.map(c => {
        const status = STATUS_LABELS[c.status] || { label: c.status, cls: 'bg-muted' };
        const isOpen = expandedId === c.id;
        return (
          <Card key={c.id} className="shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
              <Checkbox checked={selectedIds.includes(c.id)} onCheckedChange={() => setSelectedIds(prev => prev.includes(c.id) ? prev.filter(x => x !== c.id) : [...prev, c.id])} className="mt-1" />
              <div className="flex-1">
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

              <div className="flex gap-2 mt-3 justify-end">
                <Button size="sm" variant="outline" onClick={() => setPreviewCampaign(c)}>
                  <Eye size={14} className="ml-1" /> צפייה
                </Button>
                <Button size="sm" onClick={() => handleResend(c)} disabled={resendingId === c.id}>
                  {resendingId === c.id
                    ? <><Loader2 size={14} className="ml-1 animate-spin" /> שולח...</>
                    : <><Send size={14} className="ml-1" /> שלח מחדש</>}
                </Button>
              </div>

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
              </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
      {previewCampaign && (
        <CampaignPreviewDialog campaign={previewCampaign} onClose={() => setPreviewCampaign(null)} />
      )}
    </div>
  );
}