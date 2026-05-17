import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Calendar, Clock, MapPin, CheckCircle, AlertCircle } from 'lucide-react';
import { format, addDays, isBefore, startOfDay, getDay } from 'date-fns';
import { he } from 'date-fns/locale';

const TYPE_LABELS = {
  intro_sale: 'פגישת היכרות',
  advisory: 'ייעוץ',
  annual_service: 'שירות שנתי',
  zoom: 'פגישת זום',
  followup: 'פולו-אפ',
};

const LOCATION_LABELS = {
  modiin: 'מודיעין',
  petah_tikva_wednesday: 'פתח תקווה (רביעי)',
  zoom: 'זום',
  phone: 'טלפון',
};

// Available time slots (Israeli business hours, Sun-Thu)
const SLOT_HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17];

function generateSlots(durationMinutes) {
  const slots = [];
  const today = startOfDay(new Date());

  for (let d = 1; d <= 21; d++) {
    const date = addDays(today, d);
    const dayOfWeek = getDay(date); // 0=Sun, 5=Fri, 6=Sat
    if (dayOfWeek === 5 || dayOfWeek === 6) continue; // skip Fri/Sat

    for (const hour of SLOT_HOURS) {
      const slot = new Date(date);
      slot.setHours(hour, 0, 0, 0);
      const slotEnd = new Date(slot.getTime() + durationMinutes * 60 * 1000);
      // Skip slots ending after 18:00
      if (slotEnd.getHours() > 18 || (slotEnd.getHours() === 18 && slotEnd.getMinutes() > 0)) continue;
      slots.push(slot);
    }
  }
  return slots;
}

export default function ScheduleMeeting() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [meetingData, setMeetingData] = useState(null);
  const [contactData, setContactData] = useState(null);

  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [done, setDone] = useState(false);
  const [confirmedTime, setConfirmedTime] = useState(null);

  useEffect(() => {
    if (!token) {
      setError('לינק לא תקין');
      setLoading(false);
      return;
    }

    base44.functions.invoke('getScheduleData', { token })
      .then(res => {
        if (res.data?.error === 'already_scheduled') {
          setDone(true);
          setConfirmedTime(res.data.scheduled_at);
        } else if (res.data?.error) {
          setError('הלינק לא תקין או שפג תוקפו');
        } else {
          setMeetingData(res.data.meeting);
          setContactData(res.data.contact);
        }
      })
      .catch(() => setError('שגיאה בטעינת הפגישה'))
      .finally(() => setLoading(false));
  }, [token]);

  const slots = meetingData ? generateSlots(meetingData.duration_minutes) : [];
  const availableDates = [...new Set(slots.map(s => format(s, 'yyyy-MM-dd')))];

  const slotsForDate = selectedDate
    ? slots.filter(s => format(s, 'yyyy-MM-dd') === selectedDate)
    : [];

  const handleSubmit = async () => {
    if (!selectedSlot) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      const res = await base44.functions.invoke('submitSchedule', {
        token,
        scheduled_at: selectedSlot.toISOString(),
      });

      if (res.data?.error === 'conflict') {
        setSubmitError('המועד הזה כבר תפוס, אנא בחרי מועד אחר');
        setSelectedSlot(null);
      } else if (res.data?.status === 'ok') {
        setDone(true);
        setConfirmedTime(selectedSlot.toISOString());
      } else {
        setSubmitError('שגיאה בשמירת הפגישה, נסי שוב');
      }
    } catch {
      setSubmitError('שגיאה בשמירת הפגישה, נסי שוב');
    } finally {
      setSubmitting(false);
    }
  };

  const gcalLink = () => {
    if (!confirmedTime || !meetingData) return null;
    const start = new Date(confirmedTime);
    const end = new Date(start.getTime() + (meetingData.duration_minutes || 60) * 60 * 1000);
    const fmt = d => d.toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';
    const title = TYPE_LABELS[meetingData.type] || 'פגישה';
    const loc = LOCATION_LABELS[meetingData.location] || '';
    return `https://calendar.google.com/calendar/render?action=TEMPLATE` +
      `&text=${encodeURIComponent(title + ' — קרנות ראמים')}` +
      `&dates=${fmt(start)}/${fmt(end)}` +
      (loc ? `&location=${encodeURIComponent(loc)}` : '');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50" dir="rtl">
        <div className="w-8 h-8 border-4 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50 p-6" dir="rtl">
        <div className="bg-white rounded-2xl shadow-md p-8 max-w-sm w-full text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <p className="text-gray-700">{error}</p>
        </div>
      </div>
    );
  }

  if (done) {
    const time = confirmedTime ? new Date(confirmedTime) : null;
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50 p-6" dir="rtl">
        <div className="bg-white rounded-2xl shadow-md p-8 max-w-sm w-full text-center">
          <CheckCircle className="w-14 h-14 text-green-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-800 mb-2">הפגישה נקבעה!</h2>
          {time && (
            <p className="text-gray-600 mb-6">
              {format(time, "EEEE, d בMMMM yyyy 'בשעה' HH:mm", { locale: he })}
            </p>
          )}
          {gcalLink() && (
            <a
              href={gcalLink()}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-2 text-sm hover:bg-amber-100 transition-colors"
            >
              <Calendar className="w-4 h-4" />
              הוסיפי ליומן Google
            </a>
          )}
          <p className="text-sm text-gray-400 mt-6">צוות קרנות ראמים ישמח לראותך!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 p-4 py-10" dir="rtl">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-800 mb-1">תיאום פגישה</h1>
          {contactData?.full_name && (
            <p className="text-gray-500">שלום {contactData.full_name} 👋</p>
          )}
          {meetingData && (
            <div className="flex items-center justify-center gap-4 mt-3 text-sm text-gray-500">
              <span className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                {TYPE_LABELS[meetingData.type] || meetingData.type}
              </span>
              {meetingData.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  {LOCATION_LABELS[meetingData.location] || meetingData.location}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                {meetingData.duration_minutes} דקות
              </span>
            </div>
          )}
        </div>

        {/* Step 1 — Pick date */}
        <div className="bg-white rounded-2xl shadow-sm p-5 mb-4">
          <h3 className="font-semibold text-gray-700 mb-3">בחרי תאריך</h3>
          <div className="flex flex-wrap gap-2">
            {availableDates.slice(0, 14).map(d => {
              const date = new Date(d);
              const isSelected = selectedDate === d;
              return (
                <button
                  key={d}
                  onClick={() => { setSelectedDate(d); setSelectedSlot(null); }}
                  className={`px-3 py-2 rounded-xl text-sm border transition-colors ${
                    isSelected
                      ? 'bg-amber-500 text-white border-amber-500'
                      : 'bg-white text-gray-700 border-gray-200 hover:border-amber-300'
                  }`}
                >
                  <div className="font-medium">{format(date, 'EEE', { locale: he })}</div>
                  <div className="text-xs">{format(date, 'd/M')}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Step 2 — Pick time */}
        {selectedDate && (
          <div className="bg-white rounded-2xl shadow-sm p-5 mb-4">
            <h3 className="font-semibold text-gray-700 mb-3">בחרי שעה</h3>
            <div className="flex flex-wrap gap-2">
              {slotsForDate.map(slot => {
                const isSelected = selectedSlot?.toISOString() === slot.toISOString();
                return (
                  <button
                    key={slot.toISOString()}
                    onClick={() => setSelectedSlot(slot)}
                    className={`px-4 py-2 rounded-xl text-sm border transition-colors ${
                      isSelected
                        ? 'bg-amber-500 text-white border-amber-500'
                        : 'bg-white text-gray-700 border-gray-200 hover:border-amber-300'
                    }`}
                  >
                    {format(slot, 'HH:mm')}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Confirm */}
        {selectedSlot && (
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <p className="text-sm text-gray-600 mb-4">
              בחרת: <span className="font-semibold text-gray-800">
                {format(selectedSlot, "EEEE, d בMMMM 'בשעה' HH:mm", { locale: he })}
              </span>
            </p>
            {submitError && (
              <p className="text-sm text-red-500 mb-3">{submitError}</p>
            )}
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full bg-amber-500 hover:bg-amber-600 text-white rounded-xl"
            >
              {submitting ? 'שומרת...' : 'אישור הפגישה'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
