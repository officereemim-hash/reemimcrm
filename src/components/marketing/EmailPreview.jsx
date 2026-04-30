import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import buildEmailHtml from './buildEmailHtml';

export default function EmailPreview({ open, onClose, template }) {
  if (!template) return null;

  const html = buildEmailHtml(template);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-2xl max-h-[90vh] overflow-hidden p-0">
        <DialogHeader className="p-4 pb-2">
          <DialogTitle className="text-sm">תצוגה מקדימה — {template.name || 'מייל'}</DialogTitle>
        </DialogHeader>
        <div className="px-4 pb-4 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 60px)' }}>
          <div className="border border-border rounded-lg overflow-hidden bg-[#F6F2ED]">
            <iframe
              srcDoc={html}
              title="תצוגה מקדימה"
              className="w-full border-0"
              style={{ height: '600px' }}
              sandbox=""
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}