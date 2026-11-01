// Dewrito — privacy-friendly analytics hook.
// Disabled until scriptUrl is set. Honours Do Not Track and Global Privacy Control.
//
// Self-hosted Umami:   { scriptUrl: 'https://stats.example.com/script.js', websiteId: '<uuid from Umami>' }
// Plausible:           { scriptUrl: 'https://plausible.example.com/js/script.js', domain: 'dewrito.net' }
// Either one sets no cookies and stores no personal data; keep that true if you pick something else,
// and update privacy.html to name the tool.
(function () {
  'use strict';
  const ANALYTICS = { scriptUrl: '', websiteId: '', domain: '' };

  if (!ANALYTICS.scriptUrl) return;
  if (navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.globalPrivacyControl === true) return;

  const s = document.createElement('script');
  s.defer = true;
  s.src = ANALYTICS.scriptUrl;
  if (ANALYTICS.websiteId) s.setAttribute('data-website-id', ANALYTICS.websiteId);
  if (ANALYTICS.domain) s.setAttribute('data-domain', ANALYTICS.domain);
  document.head.appendChild(s);
})();
