import React, { forwardRef } from 'react';

const SERVICE_DETAILS = {
  retirement: {
    title: 'ייעוץ פרישה',
    description: 'ייעוץ מקיף לתכנון פרישה מיטבית הכולל בחינת כלל הנכסים הפנסיוניים, ניתוח מסלולי משיכה, תכנון מס ובניית תוכנית פעולה אישית.',
    items: ['ניתוח קופות גמל, פנסיה וקרנות השתלמות', 'תכנון מס אופטימלי', 'ייעוץ על מסלולי קצבה ומשיכה', 'בחינת זכאות לקצבאות', 'תוכנית פעולה מסודרת בכתב'],
  },
  economic_feasibility: {
    title: 'היתכנות כלכלית',
    description: 'בדיקת היתכנות כלכלית מעמיקה לבחינת מצבך הפיננסי הנוכחי והעתידי, כולל ניתוח הכנסות, הוצאות ותחזית לשנים הבאות.',
    items: ['ניתוח מצב פיננסי נוכחי', 'בניית תחזית כלכלית עתידית', 'המלצות לאיזון תקציבי', 'הצגת חלופות ופתרונות', 'דוח מסכם בכתב'],
  },
  investments: {
    title: 'ייעוץ השקעות',
    description: 'ייעוץ מקצועי להשקעת נכסים תוך התאמה לפרופיל הסיכון, מטרות ואופק ההשקעה שלך.',
    items: ['בניית פרופיל סיכון אישי', 'ניתוח תיק ההשקעות הקיים', 'המלצות להקצאת נכסים', 'בחינת חלופות השקעה', 'מעקב ועדכון שוטף'],
  },
  divorce_split: {
    title: 'איזון אקטוארי',
    description: 'ביצוע חוות דעת אקטוארית מקצועית לצורך הליכי גירושין, הכוללת הערכת שווי כלל הנכסים הפנסיוניים.',
    items: ['הערכת קרנות פנסיה וגמל', 'חישוב שווי ביטוחי מנהלים', 'בחינת קרנות השתלמות', 'הכנת חוות דעת מפורטת לבית משפט', 'ליווי בתהליך הפיצול'],
  },
  tax_advisory: {
    title: 'ייעוץ מס',
    description: 'ייעוץ מס מקיף המותאם לצרכיך, כולל תכנון מס שנתי, ניצול הטבות מס זמינות ועמידה בדרישות הרגולציה.',
    items: ['בדיקת זכאות להטבות מס', 'תכנון מס שנתי', 'ניצול נקודות זיכוי', 'ייעוץ על דוח שנתי', 'המלצות להפחתת חבות מס'],
  },
  annual_service: {
    title: 'שירות שנתי',
    description: 'מעטפת ליווי שנתית הכוללת ביקורת תקופתית, עדכונים שוטפים ותגובה מהירה לשינויים בשוק ובמצבך האישי.',
    items: ['פגישת עדכון שנתית', 'מעקב אחר ביצועים', 'עדכונים רגולטוריים שוטפים', 'זמינות לשאלות ופניות', 'דוח שנתי מסכם'],
  },
  annual_service_call: {
    title: 'שיחת שירות שנתית',
    description: 'שיחת עדכון ובחינה שנתית לוידוא שהתוכנית הפיננסית שלך עדיין מתאימה למצבך ולמטרותיך.',
    items: ['סקירת השנה החולפת', 'בחינת שינויים במצב האישי', 'עדכון ההמלצות בהתאם', 'תכנון לשנה הבאה'],
  },
};

const QuoteDocument = forwardRef(function QuoteDocument({ contact, request }, ref) {
  const today = new Date().toLocaleDateString('he-IL', { year: 'numeric', month: 'long', day: 'numeric' });
  const serviceKey = request?.service_type || 'retirement';
  const service = SERVICE_DETAILS[serviceKey] || SERVICE_DETAILS.retirement;

  return (
    <div
      ref={ref}
      id="quote-document-render"
      style={{
        position: 'fixed',
        top: '-9999px',
        left: '-9999px',
        width: '794px',
        minHeight: '1123px',
        backgroundColor: '#ffffff',
        fontFamily: 'Arial, Helvetica, sans-serif',
        direction: 'rtl',
        color: '#2D2D2D',
        fontSize: '14px',
        lineHeight: '1.6',
        zIndex: -1,
      }}
    >
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #4A2C78 0%, #6B3FA0 100%)',
        padding: '40px 60px 30px',
        color: 'white',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 'bold', letterSpacing: '1px' }}>קרנות ראמים</h1>
            <p style={{ margin: '4px 0 0', opacity: 0.85, fontSize: '14px' }}>ייעוץ פנסיוני ופיננסי</p>
          </div>
          <div style={{ textAlign: 'left', opacity: 0.85, fontSize: '13px' }}>
            <p style={{ margin: 0 }}>info@karanot-raamim.co.il</p>
            <p style={{ margin: '2px 0 0' }}>תאריך: {today}</p>
          </div>
        </div>

        <div style={{
          marginTop: '24px',
          background: 'rgba(255,255,255,0.15)',
          borderRadius: '8px',
          padding: '16px 20px',
          display: 'inline-block',
        }}>
          <p style={{ margin: 0, fontSize: '18px', fontWeight: 'bold' }}>הצעת מחיר — {service.title}</p>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '40px 60px' }}>

        {/* To */}
        <div style={{
          background: '#F7F2ED',
          borderRadius: '8px',
          padding: '20px 24px',
          marginBottom: '32px',
          borderRight: '4px solid #4A2C78',
        }}>
          <p style={{ margin: 0, fontSize: '16px' }}>
            לכבוד: <strong>{contact?.full_name || 'הלקוח היקר'}</strong>
          </p>
          {contact?.email && <p style={{ margin: '4px 0 0', color: '#6B6B6B', fontSize: '13px' }}>{contact.email}</p>}
          {contact?.phone && <p style={{ margin: '2px 0 0', color: '#6B6B6B', fontSize: '13px' }}>{contact.phone}</p>}
        </div>

        {/* Intro */}
        <p style={{ marginBottom: '28px', fontSize: '14px', color: '#444' }}>
          שלום {contact?.full_name?.split(' ')[0] || 'לקוח/ה'},<br />
          תודה על פנייתך אלינו. להלן הצעת המחיר עבור שירות <strong>{service.title}</strong> שנבקש לספק לך.
        </p>

        {/* Service description */}
        <div style={{ marginBottom: '28px' }}>
          <h2 style={{
            fontSize: '16px',
            fontWeight: 'bold',
            color: '#4A2C78',
            borderBottom: '2px solid #E8E0D8',
            paddingBottom: '8px',
            marginBottom: '14px',
          }}>
            תיאור השירות
          </h2>
          <p style={{ color: '#444', lineHeight: '1.7' }}>{service.description}</p>
        </div>

        {/* Included items */}
        <div style={{ marginBottom: '32px' }}>
          <h2 style={{
            fontSize: '16px',
            fontWeight: 'bold',
            color: '#4A2C78',
            borderBottom: '2px solid #E8E0D8',
            paddingBottom: '8px',
            marginBottom: '14px',
          }}>
            מה כלול בשירות
          </h2>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            {service.items.map((item, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? '#F7F2ED' : 'white' }}>
                <td style={{ padding: '10px 14px', borderRadius: '4px' }}>
                  <span style={{ color: '#4A2C78', marginLeft: '8px', fontWeight: 'bold' }}>✓</span>
                  {item}
                </td>
              </tr>
            ))}
          </table>
        </div>

        {/* Notes from request */}
        {request?.notes && (
          <div style={{ marginBottom: '28px' }}>
            <h2 style={{
              fontSize: '16px',
              fontWeight: 'bold',
              color: '#4A2C78',
              borderBottom: '2px solid #E8E0D8',
              paddingBottom: '8px',
              marginBottom: '14px',
            }}>
              הערות מיוחדות
            </h2>
            <p style={{ color: '#444', background: '#FFFBF5', padding: '14px', borderRadius: '6px', border: '1px solid #F0E6D3' }}>
              {request.notes}
            </p>
          </div>
        )}

        {/* Terms */}
        <div style={{
          background: '#F7F2ED',
          borderRadius: '8px',
          padding: '18px 22px',
          marginBottom: '40px',
          fontSize: '12px',
          color: '#666',
        }}>
          <p style={{ margin: '0 0 6px', fontWeight: 'bold', color: '#4A2C78' }}>תנאים כלליים</p>
          <p style={{ margin: 0, lineHeight: '1.7' }}>
            הצעה זו תקפה ל-30 יום ממועד הוצאתה. המחירים המוצגים כוללים מע"מ.
            קרנות ראמים פועלת בהתאם להוראות חוק הייעוץ הפנסיוני והוראות רגולטוריות רלוונטיות.
            פרטים נוספים ותנאים מלאים יינתנו בפגישה.
          </p>
        </div>

        {/* Signatures */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: '20px',
          gap: '40px',
        }}>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ borderTop: '1px solid #9E9E9E', paddingTop: '10px', marginTop: '50px' }}>
              <p style={{ margin: 0, fontSize: '13px', color: '#555' }}>חתימת הלקוח/ה</p>
              <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#999' }}>{contact?.full_name}</p>
            </div>
          </div>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ borderTop: '1px solid #9E9E9E', paddingTop: '10px', marginTop: '50px' }}>
              <p style={{ margin: 0, fontSize: '13px', color: '#555' }}>חתימת החברה</p>
              <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#999' }}>קרנות ראמים</p>
            </div>
          </div>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ borderTop: '1px solid #9E9E9E', paddingTop: '10px', marginTop: '50px' }}>
              <p style={{ margin: 0, fontSize: '13px', color: '#555' }}>תאריך</p>
              <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#999' }}>{today}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{
        background: '#4A2C78',
        color: 'white',
        textAlign: 'center',
        padding: '14px',
        fontSize: '12px',
        opacity: 0.9,
      }}>
        קרנות ראמים | ייעוץ פנסיוני ופיננסי | info@karanot-raamim.co.il
      </div>
    </div>
  );
});

export default QuoteDocument;
