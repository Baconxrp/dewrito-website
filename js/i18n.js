// Dewrito — lightweight translations.
//
// - Picks a language from ?lang=xx, then the saved choice, then the browser's languages, else English.
// - Loads lang/<code>.json and applies it to elements marked data-i18n (text), data-i18n-html (markup)
//   and data-i18n-attr="attr:key;attr:key" (attributes such as placeholder or title).
// - Adds a language switcher to the navbar (switching happens in place, no reload), and a notice on pages that are English-only
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

  // English lives in the HTML. The first time an element is translated, its original English is kept
  // here so switching back to English (or to another language) never needs a page reload.
  const originals = new WeakMap();
  function original(el, slot, read) {
    let o = originals.get(el);
    if (!o) { o = {}; originals.set(el, o); }
    if (!(slot in o)) o[slot] = read();
    return o[slot];
  }

  function apply(root) {
    root = root || document;
    root.querySelectorAll('[data-i18n]').forEach(el => {
      const en = original(el, 'text', () => el.textContent);
      const v = dict[el.dataset.i18n];
      el.textContent = v != null ? v : en;
    });
    root.querySelectorAll('[data-i18n-html]').forEach(el => {
      const en = original(el, 'html', () => el.innerHTML);
      const v = dict[el.dataset.i18nHtml];
      el.innerHTML = v != null ? v : en;
    });
    root.querySelectorAll('[data-i18n-attr]').forEach(el => {
      el.dataset.i18nAttr.split(';').forEach(pair => {
        const [attr, key] = pair.split(':').map(x => x.trim());
        if (!attr) return;
        const en = original(el, 'attr:' + attr, () => el.getAttribute(attr));
        const v = dict[key];
        if (v != null) el.setAttribute(attr, v); else if (en != null) el.setAttribute(attr, en);
      });
    });
    // Translated markup can replace these placeholders, so refill them.
    const year = document.getElementById('year');
    if (year && !year.textContent) year.textContent = new Date().getFullYear();
  }

  function makeSwitcher() {
    const sel = document.createElement('select');
    sel.className = 'lang-select lang-select-nav';
    sel.setAttribute('aria-label', t('i18n.language', 'Language'));
    for (const [code, name] of Object.entries(SUPPORTED)) {
      const o = document.createElement('option');
      o.value = code; o.textContent = name; o.selected = code === lang;
      sel.appendChild(o);
    }
    sel.addEventListener('change', () => set(sel.value));
    return sel;
  }
  function injectSwitcher() {
    const nav = document.querySelector('.navbar .nav-cta');
    if (nav && !nav.querySelector('.lang-select')) nav.prepend(makeSwitcher());
  }
  function syncSwitcher() {
    document.querySelectorAll('.lang-select').forEach(sel => {
      sel.value = lang;
      sel.setAttribute('aria-label', t('i18n.language', 'Language'));
    });
  }
  function englishOnlyNotice() {
    document.querySelectorAll('.i18n-notice').forEach(n => n.remove());
    if (lang === 'en') return;
    // chrome = body text is English only; legal = translated, but the English text is the binding one
    const meta = document.querySelector('meta[name="i18n-coverage"]');
    const header = document.querySelector('.page-header');
    if (!meta || !header) return;
    const n = document.createElement('div');
    n.className = 'i18n-notice';
    n.textContent = meta.content === 'legal'
      ? t('i18n.legalNote', 'This translation is provided for convenience. If it differs from the English version, the English version applies.')
      : t('i18n.englishOnly', 'This page is available in English only.');
    header.insertAdjacentElement('afterend', n);
  }

  const cache = {};
  function loadDict(code) {
    if (code === 'en') return Promise.resolve({});
    if (cache[code]) return Promise.resolve(cache[code]);
    return fetch(LANG_BASE + code + '.json', { cache: 'no-cache' })
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(j => (cache[code] = j || {}));
  }

  function render() {
    document.documentElement.lang = lang === 'zh' ? 'zh-Hans' : lang === 'pt' ? 'pt-BR' : lang;
    apply();
    syncSwitcher();
    englishOnlyNotice();
    document.documentElement.classList.remove('i18n-loading');
    document.dispatchEvent(new CustomEvent('i18n:ready', { detail: { lang } }));
  }

  // Switch language in place: no reload, no navigation, scroll position untouched.
  function set(code) {
    code = normalise(code) || 'en';
    try { localStorage.setItem(STORAGE_KEY, code); } catch (e) { /* ignore */ }
    // Drop a ?lang= from the address so a later reload keeps the visitor's choice.
    const url = new URL(location.href);
    if (url.searchParams.has('lang')) { url.searchParams.delete('lang'); history.replaceState(history.state, '', url.href); }
    return loadDict(code)
      .then(d => { lang = code; dict = d; })
      .catch(() => { lang = 'en'; dict = {}; })
      .then(render);
  }

  const ready = loadDict(lang)
    .then(d => { dict = d; })
    .catch(() => { lang = 'en'; dict = {}; })
    .then(() => new Promise(res => (document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', res) : res())))
    .then(() => { injectSwitcher(); render(); });

  window.i18n = { t, apply, set, ready, SUPPORTED, get lang() { return lang; } };
})();
