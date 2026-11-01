// Dewrito — shared loader for the Boosted Communities directory.
// Used by index.html (boosted bar) and community.html (full directory).
//
// Data sources
//   - Supabase table `community_ads`: submitted listings (public insert, so every field is untrusted)
//   - Stellar Horizon: native-XLM payments into our wallet, matched to a listing by the transaction memo
//   - Our homeserver's room-summary API: member counts and topics for Matrix rooms (no login needed)
//   - data/blocklist.json: homeservers excluded from the directory (also shown on moderation.html)
window.DewritoListings = (function () {
  'use strict';

  const XLM_WALLET = "GCCL23ZM4PLTMULZ2K5KQHBLK3WHSCXXLFCHOMDSLJFQ2UN532WN3HYR";
  const XLM_PER_MONTH = 25;
  const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
  const SUPABASE_URL = "https://emdooqonibsgrazbcvzp.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_r7eqc_NvhJI77DBNhvvQjA_ohkMfrKE";
  const HOMESERVER = "https://matrix.dewrito.net";
  const HORIZON = "https://horizon.stellar.org";
  const HORIZON_PAGE = 200;
  const MAX_HORIZON_PAGES = 10; // up to 2,000 payments; the wallet receives a lot of dust spam
  const EXPIRING_SOON_DAYS = 7;  // boosted listings get an "ends soon" badge inside this window

  // Words that keep a listing out of the directory entirely (whole-word match, case-insensitive).
  const BAD_WORDS = ["gore", "scam", "crypto-scam", "loli", "lolicon", "cp", "child", "toddler", "shota", "nigga", "nigger", "fag", "faggot", "fuck", "shit", "bitch", "tranny"];

  // Fallback if data/blocklist.json cannot be fetched (file:// preview, outage).
  let blockedDomains = ["cutefunny.art", "midov.pl", "dropnet.ch", "nicheart.online", "lolisho.chat", "cuteness-overdose.com", "capybara.pictures", "nerdsin.space"];

  const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

  // ---------- text safety ----------
  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  const MATRIX_ALIAS_RE = /^[#!][^\s"'<>\/]+:[A-Za-z0-9.\-]+(:\d+)?$/;

  // Only ever link to http(s) Fluxer invites or well-formed Matrix aliases/room ids.
  function safeHref(ad) {
    const url = String(ad.url || '').trim();
    if (ad.platform === "Fluxer") return /^https?:\/\/[^\s"'<>]+$/i.test(url) ? url : '#';
    return MATRIX_ALIAS_RE.test(url) ? `https://matrix.to/#/${url}` : '#';
  }

  // Whole-word match so "cp" or "scam" don't flag "mcp" or "scampi".
  function matchesBannedWord(text, words = BAD_WORDS) {
    if (!text) return false;
    const escaped = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return new RegExp(`(^|[^a-z0-9])(${escaped.join('|')})(?=$|[^a-z0-9])`, 'i').test(String(text));
  }

  function isBlockedDomain(url) {
    const u = String(url || '').toLowerCase();
    return blockedDomains.some(d => u.includes(d));
  }

  function isTruthy(v) { return v === true || parseInt(v) === 1; }

  function formatDate(d) {
    if (!d) return '';
    return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // SEP-0007 payment link: wallets that support it open pre-filled with destination, amount and memo.
  function stellarPayUri(memo, months = 1) {
    const amount = (Math.max(1, parseInt(months) || 1) * XLM_PER_MONTH).toString();
    return `web+stellar:pay?destination=${XLM_WALLET}&amount=${amount}&memo=${encodeURIComponent(memo)}&memo_type=MEMO_TEXT`;
  }

  // ---------- data loading ----------
  async function loadBlocklist() {
    try {
      const r = await fetch('data/blocklist.json', { cache: 'no-cache' });
      if (r.ok) {
        const j = await r.json();
        if (Array.isArray(j.domains) && j.domains.length) blockedDomains = j.domains.map(d => String(d).toLowerCase());
      }
    } catch (e) { /* keep fallback */ }
    return blockedDomains;
  }

  // Native-XLM payments into our wallet, each with the memo of its transaction.
  // Reads the amount (the old code assumed every memo-matched transaction was a full month)
  // and pages past the dust-spam transactions the wallet receives.
  async function fetchPayments() {
    const out = [];
    let url = `${HORIZON}/accounts/${XLM_WALLET}/payments?limit=${HORIZON_PAGE}&order=desc&join=transactions`;
    for (let page = 0; page < MAX_HORIZON_PAGES && url; page++) {
      const res = await fetch(url);
      if (!res.ok) break;
      const data = await res.json();
      const records = data._embedded?.records || [];
      for (const p of records) {
        if (p.type !== 'payment' || p.to !== XLM_WALLET || p.asset_type !== 'native') continue;
        const tx = p.transaction || {};
        if (tx.memo_type !== 'text' || !tx.memo) continue;
        out.push({ memo: String(tx.memo).trim().toLowerCase(), amount: parseFloat(p.amount) || 0, at: new Date(p.created_at) });
      }
      if (records.length < HORIZON_PAGE) break;
      url = data._links?.next?.href || null;
    }
    return out;
  }

  // Returns { listings, categories }. Each listing carries:
  //   platform, href, tier ('pinned' | 'boosted' | 'expired' | 'unboosted'), months, totalXlm,
  //   lastBoost, expiresAt, createdAt, rank (for sorting), room (filled later by enrichWithRoomInfo)
  async function load() {
    if (!supabaseClient) throw new Error('supabase-js is not loaded');
    const [{ data: rows, error }, payments] = await Promise.all([
      supabaseClient.from('community_ads').select('*'),
      fetchPayments().catch(e => { console.warn('Horizon unavailable, boosts cannot be verified', e); return []; }),
      loadBlocklist()
    ]);
    if (error) throw error;

    const byMemo = new Map();
    for (const p of payments) {
      if (!byMemo.has(p.memo)) byMemo.set(p.memo, []);
      byMemo.get(p.memo).push(p);
    }

    // Group rows by community URL: the same room may have been submitted more than once (several memos).
    const groups = new Map();
    for (const row of rows || []) {
      if (!row || !row.url) continue;
      const key = String(row.url).trim().toLowerCase();
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }

    const now = new Date();
    const listings = [];
    for (const [, group] of groups) {
      const base = group.find(r => isTruthy(r.is_permanent)) || group[0];
      const platform = base.platform || (String(base.url).trim().toLowerCase().startsWith('http') ? 'Fluxer' : 'Matrix');
      const pays = group.flatMap(r => byMemo.get(String(r.id).trim().toLowerCase()) || []);
      const totalXlm = pays.reduce((s, p) => s + p.amount, 0);
      const months = Math.floor(totalXlm / XLM_PER_MONTH);
      const lastBoost = pays.length ? new Date(Math.max(...pays.map(p => +p.at))) : null;
      const isPermanent = group.some(r => isTruthy(r.is_permanent));
      const isBanned = group.some(r => isTruthy(r.is_banned));
      const expiresAt = months > 0 && lastBoost ? new Date(+lastBoost + months * MONTH_MS) : null;
      const isPaid = months > 0;
      const isExpired = isPaid && !isPermanent && expiresAt < now;
      const tier = isPermanent ? 'pinned' : isPaid && !isExpired ? 'boosted' : isExpired ? 'expired' : 'unboosted';
      const daysLeft = tier === 'boosted' ? Math.ceil((expiresAt - now) / 86400000) : null;
      const createdAt = group.map(r => r.created_at ? new Date(r.created_at) : null).filter(Boolean).sort((a, b) => a - b)[0] || null;
      listings.push({
        ...base, platform, isPermanent, isBanned, isPaid, isExpired, months, totalXlm, lastBoost, expiresAt, createdAt, tier,
        daysLeft, expiresSoon: daysLeft !== null && daysLeft <= EXPIRING_SOON_DAYS,
        // Pinned entries sort as if they had paid for four months (same weighting the site always used).
        rank: isPermanent ? 4 + months : (isExpired ? 0 : months),
        href: safeHref({ platform, url: base.url }),
        room: null
      });
    }

    const categories = Array.from(new Set(listings.map(l => l.category).filter(Boolean))).sort();
    return { listings, categories };
  }

  // Content rules every surface applies. NSFW handling is left to the caller (community.html has an age gate).
  function passesContentRules(l, { allowNsfw = false } = {}) {
    if (l.isBanned) return false;
    if (!allowNsfw && l.content_rating === 'NSFW') return false;
    if (isBlockedDomain(l.url)) return false;
    if (matchesBannedWord(l.name) || matchesBannedWord(l.description)) return false;
    return true;
  }

  // ---------- Matrix room info ----------
  // Unauthenticated room summary (MSC3266). Works for rooms on other homeservers via federation.
  async function roomSummary(alias) {
    if (!MATRIX_ALIAS_RE.test(alias)) return null;
    const cacheKey = 'dw_room:' + alias;
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) { const j = JSON.parse(cached); if (Date.now() - j.t < 3600e3) return j.v; }
    } catch (e) { /* storage unavailable */ }
    const server = alias.split(':').slice(1).join(':');
    let v = null;
    try {
      const r = await fetch(`${HOMESERVER}/_matrix/client/unstable/im.nheko.summary/summary/${encodeURIComponent(alias)}?via=${encodeURIComponent(server)}`);
      if (r.ok) {
        const j = await r.json();
        v = { members: Number.isFinite(j.num_joined_members) ? j.num_joined_members : null, topic: j.topic || '', name: j.name || '', joinRule: j.join_rule || '', isSpace: j.room_type === 'm.space' };
      }
    } catch (e) { /* unreachable: leave null */ }
    try { sessionStorage.setItem(cacheKey, JSON.stringify({ t: Date.now(), v })); } catch (e) { /* ignore */ }
    return v;
  }

  // Fills `room` on Matrix listings a few at a time. onUpdate is called (debounced) as results arrive,
  // since lookups that go over federation to other homeservers can take several seconds each.
  async function enrichWithRoomInfo(listings, onUpdate, concurrency = 8) {
    const queue = listings.filter(l => l.platform === 'Matrix' && l.href !== '#' && l.room === null);
    let timer = null;
    const notify = () => {
      if (typeof onUpdate !== 'function') return;
      clearTimeout(timer);
      timer = setTimeout(onUpdate, 250);
    };
    async function worker() {
      while (queue.length) {
        const l = queue.shift();
        const info = await roomSummary(String(l.url).trim());
        l.room = info || false; // false = looked up, nothing available
        if (info) notify();
      }
    }
    await Promise.all(Array.from({ length: concurrency }, worker));
    clearTimeout(timer);
    if (typeof onUpdate === 'function') onUpdate();
  }

  return {
    load, enrichWithRoomInfo, roomSummary, passesContentRules,
    escapeHtml, safeHref, matchesBannedWord, isBlockedDomain, formatDate, stellarPayUri,
    getBlockedDomains: () => blockedDomains.slice(),
    supabaseClient, XLM_WALLET, XLM_PER_MONTH, MONTH_MS, BAD_WORDS
  };
})();
