import { useState, useRef, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

export default function SignDocument() {
  const token = new URLSearchParams(window.location.search).get('token');
  const canvasRef = useRef(null);

  const [docData, setDocData] = useState(null);
  const [signerName, setSignerName] = useState('');
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSigned, setHasSigned] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [signedFileUrl, setSignedFileUrl] = useState(null);
  const lastPos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!token) { setError('הלינק אינו תקין.'); setLoading(false); return; }
    base44.functions.invoke('getAgreementData', { token })
      .then(res => {
        const data = res?.data;
        if (!data) { setError('לא ניתן לטעון את המסמך.'); return; }
        if (data.error === 'already_signed') { setError('מסמך זה כבר נחתם. אין צורך לפעול שוב.'); return; }
        if (data.error === 'not_found') { setError('הלינק אינו תקין או שפג תוקפו.'); return; }
        if (data.error) { setError('שגיאה בטעינת המסמך.'); return; }
        setDocData(data);
      })
      .catch(() => setError('שגיאה בחיבור לשרת.'))
      .finally(() => setLoading(false));
  }, [token]);

  const getCanvasPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  };

  const startDrawing = (e) => {
    e.preventDefault();
    lastPos.current = getCanvasPos(e);
    setIsDrawing(true);
    setHasSigned(true);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const pos = getCanvasPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1a1a2e';
    ctx.stroke();
    lastPos.current = pos;
  };

  const stopDrawing = () => setIsDrawing(false);

  const clearCanvas = () => {
    canvasRef.current.getContext('2d').clearRect(0, 0, 560, 160);
    setHasSigned(false);
  };

  const handleSubmit = async () => {
    if (!signerName.trim()) { setError('נא להזין שם מלא לפני החתימה.'); return; }
    if (!hasSigned) { setError('נא לחתום בתיבת החתימה.'); return; }
    setError('');
    setSubmitting(true);
    try {
      // Convert canvas to base64 data URL and send directly to backend
      const canvas = canvasRef.current;
      const signatureDataUrl = canvas.toDataURL('image/png');

      const res = await base44.functions.invoke('submitSignature', {
        token,
        signer_name: signerName.trim(),
        signature_data: signatureDataUrl,
      });

      if (res?.data?.ok) {
        setSignedFileUrl(res?.data?.file_url || null);
        setSubmitted(true);
      } else {
        setError(res?.data?.error === 'already_signed'
          ? 'המסמך כבר נחתם בעבר.'
          : 'שגיאה בשמירת החתימה. נסה שנית.');
      }
    } catch {
      setError('שגיאה בשמירת החתימה. נסה שנית.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return (
    <div style={S.fullCenter}>
      <div style={S.spinner} />
      <p style={{ color: '#6B6B6B', marginTop: '16px' }}>טוען מסמך...</p>
    </div>
  );

  if (error && !docData) return (
    <div style={S.fullCenter}>
      <div style={S.errorBox}>
        <p style={{ fontSize: '40px', margin: 0 }}>⚠️</p>
        <p style={{ color: '#E07B6B', fontWeight: '600', marginTop: '12px' }}>{error}</p>
      </div>
    </div>
  );

  if (submitted) return (
    <div style={S.fullCenter}>
      <div style={S.successBox}>
        <p style={{ fontSize: '56px', margin: 0 }}>✅</p>
        <h2 style={{ color: '#2A6A2A', margin: '16px 0 8px' }}>החתימה התקבלה!</h2>
        <p style={{ color: '#555', margin: 0 }}>תודה {signerName}. המסמך נחתם בהצלחה ונשמר במערכת שלנו.</p>
        <p style={{ color: '#888', fontSize: '13px', marginTop: '16px' }}>קרנות ראמים יצרו איתך קשר בקרוב.</p>
        {signedFileUrl && (
          <button
            onClick={() => window.open(signedFileUrl, '_blank')}
            style={{ marginTop: '20px', background: '#4A2C78', color: 'white', border: 'none', padding: '12px 24px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}
          >
            📥 צפה במסמך החתום
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.header}>
          <h1 style={{ color: '#4A2C78', margin: 0, fontSize: '22px' }}>🌿 קרנות ראמים</h1>
          <p style={{ color: '#6B6B6B', margin: '4px 0 0', fontSize: '14px' }}>חתימה דיגיטלית על מסמך</p>
        </div>

        <div style={S.docHeader}>
          <p style={{ margin: 0, fontWeight: '600', fontSize: '15px', color: '#4A2C78' }}>
            📄 {docData?.document_name}
          </p>
          {docData?.file_url && (
            <a href={docData.file_url} target="_blank" rel="noopener noreferrer"
              style={{ display: 'block', marginTop: '8px', color: '#4A2C78', fontSize: '13px', textDecoration: 'underline' }}>
              לצפייה במסמך לפני החתימה ←
            </a>
          )}
        </div>

        {docData?.agreement_text && (
          <div style={S.agreementBox}>
            <p style={{ margin: '0 0 8px', fontWeight: '600', fontSize: '13px', color: '#4A2C78' }}>תוכן המסמך:</p>
            <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.75', fontSize: '13px', color: '#333' }}>
              {docData.agreement_text}
            </div>
          </div>
        )}

        <div style={S.fieldGroup}>
          <label style={S.label}>שם מלא *</label>
          <input style={S.input} value={signerName} onChange={e => setSignerName(e.target.value)} placeholder="הזן/י את שמך המלא" />
        </div>

        <div style={S.fieldGroup}>
          <label style={S.label}>חתימה *</label>
          <p style={{ margin: '0 0 8px', fontSize: '12px', color: '#888' }}>חתום/י בתיבה למטה עם האצבע או העכבר</p>
          <div style={S.canvasContainer}>
            <canvas ref={canvasRef} width={560} height={160} style={S.canvas}
              onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onMouseLeave={stopDrawing}
              onTouchStart={startDrawing} onTouchMove={draw} onTouchEnd={stopDrawing} />
            {!hasSigned && <div style={S.canvasHint}>חתום/י כאן</div>}
          </div>
          <button onClick={clearCanvas} style={S.clearBtn}>🗑 נקה חתימה</button>
        </div>

        {error && <div style={S.errorInline}>⚠️ {error}</div>}

        <button onClick={handleSubmit} disabled={submitting}
          style={{ ...S.submitBtn, opacity: submitting ? 0.7 : 1 }}>
          {submitting ? '⏳ שומר חתימה...' : '✅ אני מאשר/ת ומאשר/ת בחתימתי'}
        </button>

        <p style={{ textAlign: 'center', fontSize: '11px', color: '#aaa', marginTop: '12px' }}>
          החתימה תישמר עם חותמת זמן ותיעוד מאובטח
        </p>
      </div>
    </div>
  );
}

const S = {
  page: { minHeight: '100vh', background: '#F7F2ED', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '24px 16px 48px', direction: 'rtl', fontFamily: 'Arial, Helvetica, sans-serif' },
  card: { background: 'white', borderRadius: '16px', padding: '32px', width: '100%', maxWidth: '620px', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' },
  header: { textAlign: 'center', paddingBottom: '20px', borderBottom: '1px solid #E8E0D8', marginBottom: '24px' },
  docHeader: { background: '#F0EBF8', borderRadius: '8px', padding: '14px 18px', marginBottom: '20px', border: '1px solid #D4C5E8' },
  agreementBox: { background: '#FAFAF8', border: '1px solid #E8E0D8', borderRadius: '8px', padding: '18px 20px', marginBottom: '24px', maxHeight: '260px', overflowY: 'auto' },
  fieldGroup: { marginBottom: '20px' },
  label: { display: 'block', fontWeight: '600', fontSize: '14px', marginBottom: '8px', color: '#2D2D2D' },
  input: { width: '100%', padding: '11px 14px', border: '1.5px solid #E8E0D8', borderRadius: '8px', fontSize: '15px', direction: 'rtl', boxSizing: 'border-box', outline: 'none', fontFamily: 'Arial, Helvetica, sans-serif' },
  canvasContainer: { position: 'relative', border: '1.5px solid #C8B8D8', borderRadius: '8px', overflow: 'hidden', background: '#FDFCFE', cursor: 'crosshair' },
  canvas: { display: 'block', width: '100%', height: '160px', touchAction: 'none' },
  canvasHint: { position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: '#C0B0D0', fontSize: '16px', pointerEvents: 'none', userSelect: 'none' },
  clearBtn: { marginTop: '8px', background: 'none', border: 'none', color: '#888', fontSize: '13px', cursor: 'pointer', textDecoration: 'underline', padding: '2px 0' },
  errorInline: { background: '#FEF0ED', border: '1px solid #F0C0B0', borderRadius: '8px', padding: '12px 16px', color: '#C0392B', fontSize: '14px', marginBottom: '16px' },
  submitBtn: { width: '100%', padding: '15px', background: '#4A2C78', color: 'white', border: 'none', borderRadius: '10px', fontSize: '16px', fontWeight: '700', cursor: 'pointer', letterSpacing: '0.3px' },
  fullCenter: { minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', direction: 'rtl', fontFamily: 'Arial, Helvetica, sans-serif', background: '#F7F2ED' },
  errorBox: { textAlign: 'center', background: 'white', padding: '40px', borderRadius: '12px', boxShadow: '0 2px 16px rgba(0,0,0,0.08)' },
  successBox: { textAlign: 'center', background: 'white', padding: '48px 40px', borderRadius: '16px', boxShadow: '0 4px 24px rgba(0,0,0,0.10)', maxWidth: '400px' },
  spinner: { width: '40px', height: '40px', border: '4px solid #E8E0D8', borderTop: '4px solid #4A2C78', borderRadius: '50%', animation: 'spin 0.8s linear infinite' },
};