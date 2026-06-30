export const SERVICE_CONTENT_ROUTE_MAP = {
  service_intake: {
    label: 'קליטת ליד / פתיחה',
    matchers: [
      { content_type: 'external_link', sub_type: 'coordinator_calendar_link' },
    ],
  },
  service_a_interested: {
    label: 'מסלול א — מעוניין',
    matchers: [
      { content_type: 'pdf', sub_type_prefix: 'quote_' },
      { content_type: 'calendar_link', sub_types: ['zoom_calendar', 'modiin_calendar', 'petah_tikva_calendar', 'phone_calendar', 'divorce_calendar', 'annual_service_calendar', 'coordinator_calendar'] },
      { content_type: 'questionnaire', sub_type_prefix: 'shoranss_' },
      { content_type: 'external_link', sub_types: ['waze_modiin', 'waze_petah_tikva', 'zoom_personal_room'] },
    ],
  },
  service_b_awaiting: {
    label: 'מסלול ב — ממתין להחלטה',
    matchers: [
      { content_type: 'pdf', sub_type_prefix: 'quote_' },
      { content_type: 'external_link', sub_types: ['reviews_page', 'qa_page'] },
    ],
  },
  service_c_not_interested: {
    label: 'מסלול ג — לא מעוניין',
    matchers: [
      { content_type: 'external_link', sub_types: ['reviews_page', 'qa_page'] },
    ],
  },
  webinar: {
    label: 'וובינר',
    matchers: [
      { content_type: 'external_link', sub_type_prefix: 'zoom_webinar_' },
      { content_type: 'external_link', sub_type_prefix: 'recording_webinar_' },
      { content_type: 'external_link', sub_type: 'webinar_landing_base' },
      { content_type: 'payment_link', sub_type_prefix: 'payment_webinar_' },
    ],
  },
  shared: {
    label: 'משותף — מערכת',
    matchers: [],
  },
};

export function itemMatchesRoute(item, route) {
  const def = SERVICE_CONTENT_ROUTE_MAP[route];
  if (!def) return false;
  if (def.matchers.length === 0) return true; // shared = catch-all
  return def.matchers.some(m =>
    (!m.content_type || m.content_type === item.content_type) &&
    (!m.sub_type || m.sub_type === item.sub_type) &&
    (!m.sub_types || m.sub_types.includes(item.sub_type)) &&
    (!m.sub_type_prefix || (item.sub_type || '').startsWith(m.sub_type_prefix))
  );
}