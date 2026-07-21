import { useEffect } from 'react';

const GTM_ID = 'GTM-TXRHJDCR';

export default function GtmTracker({ slug }) {
  useEffect(() => {
    window.dataLayer = window.dataLayer || [];
    if (!document.getElementById('gtm-script')) {
      window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
      const s = document.createElement('script');
      s.id = 'gtm-script';
      s.async = true;
      s.src = 'https://www.googletagmanager.com/gtm.js?id=' + GTM_ID;
      document.head.appendChild(s);
    }
  }, []);

  useEffect(() => {
    if (slug) {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({
        event: 'webinar_landing_view',
        webinar_slug: slug,
        page_path: window.location.pathname
      });
    }
  }, [slug]);

  return null;
}