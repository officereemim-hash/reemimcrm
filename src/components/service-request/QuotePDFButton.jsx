import { useState, useRef } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { Button } from '@/components/ui/button';
import { FileText, Loader2 } from 'lucide-react';
import QuoteDocument from './QuoteDocument';

export default function QuotePDFButton({ contact, request, onQuoteSent }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const docRef = useRef(null);

  const generate = async () => {
    setLoading(true);
    setError('');
    try {
      const element = docRef.current;
      if (!element) throw new Error('אלמנט לא נמצא');

      // וידוא שהאלמנט מרונדר (גלוי מחוץ לגבולות המסך)
      await new Promise(r => setTimeout(r, 100));

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        windowWidth: 794,
        width: 794,
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.92);

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const pageWidth = pdf.internal.pageSize.getWidth();   // 210mm
      const pageHeight = pdf.internal.pageSize.getHeight(); // 297mm
      const imgPxWidth = canvas.width;
      const imgPxHeight = canvas.height;

      // ממדי תמונה ב-mm
      const imgMmWidth = pageWidth;
      const imgMmHeight = (imgPxHeight / imgPxWidth) * pageWidth;

      // ריבוי עמודים אם צריך
      let heightLeft = imgMmHeight;
      let yOffset = 0;
      let firstPage = true;

      while (heightLeft > 0) {
        if (!firstPage) pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, -yOffset, imgMmWidth, imgMmHeight);
        yOffset += pageHeight;
        heightLeft -= pageHeight;
        firstPage = false;
      }

      const contactName = contact?.full_name?.replace(/\s+/g, '_') || 'לקוח';
      const dateStr = new Date().toLocaleDateString('he-IL').replace(/\//g, '-');
      pdf.save(`הצעת_מחיר_${contactName}_${dateStr}.pdf`);

      if (onQuoteSent) onQuoteSent();

    } catch (err) {
      console.error('PDF generation error:', err);
      setError('שגיאה ביצירת ה-PDF. נסה שנית.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* האלמנט הנסתר שמרונדר מחוץ למסך */}
      <QuoteDocument ref={docRef} contact={contact} request={request} />

      <div className="space-y-2">
        <Button
          onClick={generate}
          disabled={loading}
          className="w-full"
          variant="outline"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 ml-2 animate-spin" />
              מייצר PDF...
            </>
          ) : (
            <>
              <FileText className="w-4 h-4 ml-2" />
              הפק הצעת מחיר PDF
            </>
          )}
        </Button>
        {error && <p className="text-sm text-destructive text-center">{error}</p>}
        <p className="text-xs text-muted-foreground text-center">
          הקובץ יורד למחשב שלך — שלח ללקוח ידנית
        </p>
      </div>
    </>
  );
}
