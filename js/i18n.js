// Dewrito — lightweight translations.
//
// - Picks a language from ?lang=xx, then the saved choice, then the browser's languages, else English.
// - Loads lang/<code>.json and applies it to elements marked data-i18n (text), data-i18n-html (markup)
//   and data-i18n-attr="attr:key;attr:key" (attributes such as placeholder or title).
// - Adds a language switcher to the navbar and the footer, and a notice on pages that are English-only
//   (those carry <meta name="i18n-coverage" content="chrome">).
// - Page scripts use i18n.t(key, fallback) for strings they build themselves and re-render on 'i18n:ready'.
// English is the text already in the HTML; lang/en.json exists only as the reference for translators.
(function () {
  'use strict';
  const SUPPORTED = { en: 'English', pt: 'Português', es: 'Español', fr: 'Français', de: 'Deutsch', ru: 'Русский', zh: '中文' };
  const STORAGE_KEY = 'dw_lang';
  const scriptEl = document.currentScript;
  const LANG_BASE = scriptEl ? new URL('../lang/', scriptEl.src).href : 'lang/';

  function normalise(code) {
    if (!code) return null;
    const base = String(code).toLowerCase().split(/[-_]/)[0];
    return SUPPORTED[base] ? base : null;
  }
  function detect() {
    const fromUrl = normalise(new URLSearchParams(location.search).get('lang'));
    if (fromUrl) { try { localStorage.setItem(STORAGE_KEY, fromUrl); } catch (e) { /* ignore */ } return fromUrl; }
    try { const saved = normalise(localStorage.getItem(STORAGE_KEY)); if (saved) return saved; } catch (e) { /* ignore */ }
    for (const l of (navigator.languages || [navigator.language])) { const c = normalise(l); if (c) return c; }
    return 'en';
  }

  let lang = detect();
  let dict = {};
  const t = (key, fallback) => (Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : (fallback !== undefined ? fallback : key));

  // Hide the page briefly while a non-English dictionary loads, so visitors don't see English flash first.
  if (lang !== 'en') {
    document.documentElement.classList.add('i18n-loading');
    const st = document.createElement('style');
    st.textContent = '.i18n-loading body{visibility:hidden}';
    document.head.appendChild(st);
    setTimeout(() => document.documentElement.classList.remove('i18n-loading'), 1500);
  }

  function apply(root) {
    root = root || document;
    root.querySelectorAll('[data-i18n]').forEach(el => { const v = dict[el.dataset.i18n]; if (v != null) el.textContent = v; });
    root.querySelectorAll('[data-i18n-html]').forEach(el => { const v = dict[el.dataset.i18nHtml]; if (v != null) el.innerHTML = v; });
    root.querySelectorAll('[data-i18n-attr]').forEach(el => {
      el.dataset.i18nAttr.split(';').forEach(pair => {
        const [attr, key] = pair.split(':').map(s => s.trim());
        const v = dict[key];
        if (attr && v != null) el.setAttribute(attr, v);
      });
    });
  }

  function makeSwitcher(className) {
    const sel = document.createElement('select');
    sel.className = 'lang-select ' + (className || '');
    sel.setAttribute('aria-label', t('i18n.language', 'Language'));
    for (const [code, name] of Object.entries(SUPPORTED)) {
      const o = document.createElement('option');
      o.value = code; o.textContent = name; o.selected = code === lang;
      sel.appendChild(o);
    }
    sel.addEventListener('change', () => set(sel.value));
    return sel;
  }
  function injectSwitchers() {
    const nav = document.querySelector('.navbar .nav-cta');
    if (nav) nav.prepend(makeSwitcher('lang-select-nav'));
    const foot = document.querySelector('.footer .container');
    if (foot) foot.appendChild(makeSwitcher('lang-select-footer'));
  }
  function englishOnlyNotice() {
    if (lang === 'en') return;
    const meta = document.querySelector('meta[name="i18n-coverage"][content="chrome"]');
    const header = document.querySelector('.page-header');
    if (!meta || !header) return;
    const n = document.createElement('div');
    n.className = 'i18n-notice';
    n.textContent = t('i18n.englishOnly', 'This page is available in English only.');
    header.insertAdjacentElement('afterend', n);
  }

  function set(code) {
    code = normalise(code) || 'en';
    try { localStorage.setItem(STORAGE_KEY, code); } catch (e) { /* ignore */ }
    const url = new URL(location.href);
    url.searchParams.delete('lang');
    location.href = url.href; // reload with the new choice
  }

  const ready = (lang === 'en'
    ? Promise.resolve()
    : fetch(LANG_BASE + lang + '.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : Promise.reject(r.status)).then(j => { dict = j || {}; }).catch(() => { lang = 'en'; dict = {}; })
  ).then(() => new Promise(res => (document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', res) : res())))
   .then(() => {
      document.documentElement.lang = lang === 'zh' ? 'zh-Hans' : lang === 'pt' ? 'pt-BR' : lang;
      apply();
      injectSwitchers();
      englishOnlyNotice();
      document.documentElement.classList.remove('i18n-loading');
      document.dispatchEvent(new CustomEvent('i18n:ready', { detail: { lang } }));
   });

  window.i18n = { t, apply, set, ready, SUPPORTED, get lang() { return lang; } };
})();
