import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// תצוגה מקדימה של תוכן קמפיין — מייל (iframe) ו/או הודעת וואטסאפ (בועה)
export default function CampaignPreviewDialog({ campaign, onClose }) {
  if (!campaign) return null;

  // קמפיינים ישנים שמרו snapshot אחד בלבד — אם הערוץ וואטסאפ, ה-content_snapshot הוא טקסט וואטסאפ
  const legacyWaOnly = campaign.channel === 'whatsapp' && !campaign.whatsapp_snapshot;
  const emailHtml = legacyWaOnly ? '' : (campaign.content_snapshot || '');
  const waText = campaign.whatsapp_snapshot || (legacyWaOnly ? campaign.content_snapshot : '');

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>תצוגה מקדימה — {campaign.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {emailHtml && (
            <div>
              <p className="text-sm font-semibold mb-1">📧 מייל{campaign.subject ? ` — ${campaign.subject}` : ''}</p>
              <iframe
                srcDoc={emailHtml}
                title="תצוגת מייל"
                className="w-full border rounded-lg min-h-[450px] bg-white"
              />
            </div>
          )}
          {waText && (
            <div>
              <p className="text-sm font-semibold mb-1">💬 וואטסאפ</p>
              <div className="rounded-lg p-4 bg-[#e5ddd5]">
                <div className="max-w-md mr-auto bg-[#dcf8c6] rounded-lg p-3 shadow-sm whitespace-pre-wrap text-sm text-gray-900 leading-relaxed">
                  {waText}
                </div>
              </div>
            </div>
          )}
          {!emailHtml && !waText && (
            <p className="text-sm text-muted-foreground py-4 text-center">לא נשמר תוכן לקמפיין זה</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}