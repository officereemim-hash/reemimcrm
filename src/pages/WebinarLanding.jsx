import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Calendar, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import WebinarRegistrationForm from '@/components/landing/WebinarRegistrationForm';

export default function WebinarLanding() {
  const { slug } = useParams();
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    base44.functions.invoke('getLandingPage', { slug })
      .then(res => {
        if (res.data?.page) setPage(res.data.page);
        else setError(true);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50" dir="rtl">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !page) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50 p-6" dir="rtl">
        <div className="bg-white rounded-2xl shadow-md p-8 max-w-sm w-full text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <p className="text-gray-700">הדף לא נמצא או אינו פעיל כרגע.</p>
        </div>
      </div>
    );
  }

  const primary = page.primary_color || '#4B2E83';
  const accent = page.accent_color || '#D4A53C';
  const dateStr = page.webinar_date
    ? format(new Date(page.webinar_date), "EEEE, d בMMMM yyyy 'בשעה' HH:mm", { locale: he })
    : '';

  return (
    <div className="min-h-screen bg-stone-50" dir="rtl">
      {/* Hero */}
      <div className="relative text-white" style={{ backgroundColor: primary }}>
        {page.hero_image_url && page.hero_image_fit === 'contain' ? (
          /* תמונה מלאה — מוצגת במלואה ללא חיתוך, מוגבלת לחצי גובה מסך */
          <img src={page.hero_image_url} alt={page.hero_title || ''} className="w-full block max-h-[50vh] object-contain mx-auto" />
        ) : page.hero_image_url ? (
          /* מילוי — חיתוך לרקע בגובה קבוע, עם מיקום אנכי נשלט */
          <div className="absolute inset-0 opacity-20 bg-no-repeat bg-cover"
            style={{ backgroundImage: `url(${page.hero_image_url})`, backgroundPosition: `center ${page.hero_image_position || 'center'}` }} />
        ) : null}

        {/* טקסט הבאנר — שכבת-על על התמונה במצב "מלא", או על רקע הצבע במצב "מילוי"/ללא תמונה */}
        <div className={`${page.hero_image_url && page.hero_image_fit === 'contain' ? 'absolute inset-0 flex flex-col items-center justify-center bg-black/30' : 'relative py-16 md:py-24'} px-6`}>
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-3xl md:text-5xl font-bold mb-4 drop-shadow">{page.hero_title || 'וובינר מקצועי'}</h1>
            {page.hero_subtitle && <p className="text-lg md:text-xl opacity-90 drop-shadow">{page.hero_subtitle}</p>}
            {dateStr && (
              <div className="inline-flex items-center gap-2 mt-6 px-4 py-2 rounded-full text-sm" style={{ backgroundColor: accent }}>
                <Calendar className="w-4 h-4" />
                {dateStr}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-10 grid md:grid-cols-5 gap-8">
        {/* Content blocks */}
        <div className="md:col-span-3 space-y-6">
          {page.speaker_name && (
            <div className="flex items-center gap-4 bg-white rounded-2xl shadow-sm p-4">
              {page.speaker_image_url && (
                <img src={page.speaker_image_url} alt={page.speaker_name}
                  className={`w-16 h-16 rounded-full bg-muted ${page.speaker_image_fit === 'contain' ? 'object-contain' : 'object-cover'}`} />
              )}
              <div>
                <div className="font-bold" style={{ color: primary }}>{page.speaker_name}</div>
                {page.speaker_title && <div className="text-sm text-gray-500">{page.speaker_title}</div>}
              </div>
            </div>
          )}

          {(page.blocks || []).map((block, idx) => (
            <div key={idx} className="bg-white rounded-2xl shadow-sm p-5">
              {block.type === 'image' && block.image_url && (
                <img src={block.image_url} alt="" className="w-full rounded-xl" />
              )}
              {block.type !== 'image' && (
                <>
                  {block.title && <h3 className="font-bold mb-2" style={{ color: primary }}>{block.title}</h3>}
                  {block.content && <p className="text-gray-600 whitespace-pre-line leading-relaxed">{block.content}</p>}
                </>
              )}
            </div>
          ))}
        </div>

        {/* Registration form */}
        <div className="md:col-span-2">
          <div className="bg-white rounded-2xl shadow-md p-6 md:sticky md:top-6">
            <WebinarRegistrationForm slug={slug} page={page} />
          </div>
        </div>
      </div>

      <footer className="text-center text-sm text-gray-400 py-8">
        קרנות ראמים — ייעוץ פנסיוני ופרישה
      </footer>
    </div>
  );
}