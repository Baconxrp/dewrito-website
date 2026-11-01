# dewrito-website

The public site for [Dewrito.net](https://dewrito.net), a community-run Matrix homeserver and Fluxer instance. Static HTML, CSS and JavaScript, no build step: open `index.html` or serve the folder with any web server.

## Pages

| Page | What it does |
| --- | --- |
| `index.html` | Landing page with the boosted-communities bar (top) and live status strip (bottom) |
| `community.html` | Boosted Communities directory: submit a listing, filter, search, boost with XLM |
| `register.html` | Client comparison, allowed email providers, email provider checker |
| `getting-started.html` | Step-by-step onboarding guide for Matrix and Fluxer |
| `status.html` | Live service checks and notices from `data/announcements.json` |
| `boosthelp.html` | How boosting with Stellar works |
| `donate.html`, `contact.html`, `terms.html`, `privacy.html`, `moderation.html` | Support, contact, legal, and moderation policy |
| `404.html` | Not-found page (root-relative paths; configure your server to serve it) |
| `template/registration_success.html` | Served by the homeserver after email verification, not linked from the site |

## How the directory works

`js/listings.js` is shared by the home page and the directory page.

1. Listings come from the Supabase table `community_ads` (public insert from the submit form, publishable key in the file).
2. Payments come from Stellar Horizon: native-XLM payments into the wallet, joined with their transaction memo. The memo is the listing's five-character id. Every 25 XLM adds 30 days from the latest payment; amounts below 25 XLM count for nothing, which also discards the dust-spam the wallet receives. Horizon is paged up to 2,000 payments.
3. Matrix rooms are enriched with member counts and topics from the homeserver's unauthenticated room-summary API, cached in `sessionStorage` for an hour.
4. Tiers: `pinned` (`is_permanent` set in the table), `boosted`, `expired`, `unboosted`. The home-page bar only shows pinned and boosted. The directory shows all four; set `SHOW_UNBOOSTED` in `community.html` to `false` to hide submissions that were never boosted.
5. Filters: rows with `is_banned` set, homeservers in `data/blocklist.json`, and names or descriptions matching the word list in `listings.js` are never shown.

Everything rendered from the table is HTML-escaped, and links are only built from `https://` Fluxer URLs or well-formed Matrix aliases.

## Languages

`js/i18n.js` translates every page into Brazilian Portuguese, Spanish, French, German, Russian and Simplified Chinese. The language comes from `?lang=xx`, then the visitor's saved choice, then the browser's language list, else English. A switcher sits in the navbar; changing it translates the page in place, without a reload, and the choice is remembered. The terms and privacy pages show a translated note that the English version is the binding one (`<meta name="i18n-coverage" content="legal">`). When you change the English text of those pages, update or remove the matching `terms.*` / `privacy.*` keys in each `lang/*.json` so the translations don't go stale.

- Strings live in `lang/<code>.json`; `lang/en.json` is the reference list of keys and English text (the English itself is in the HTML).
- Markup is tagged with `data-i18n="key"` (text), `data-i18n-html="key"` (markup allowed) or `data-i18n-attr="placeholder:key"`.
- Page scripts build some strings at runtime and use `i18n.t(key, fallback)`, re-rendering on the `i18n:ready` event.
- To add a language: copy `lang/en.json`, translate the values (keep `{placeholders}` and tags), add the code to `SUPPORTED` in `js/i18n.js`.
- The translations were machine-assisted; a native speaker's pass is welcome.

## Editing content

- **Notices** (maintenance, incidents): add an item to `data/announcements.json`. Set `active` to `false` when it is over.
- **Directory blocklist**: edit `data/blocklist.json`. It feeds both the directory filter and `moderation.html`.
- **Email whitelist**: edit the lists in `register.html`. The checker on that page reads them from the DOM, so there is nothing else to update. Keep it in sync with the homeserver's registration config.
- **Uptime history**: deploy something like [Uptime Kuma](https://github.com/louislam/uptime-kuma), create a public status page there, and put its URL in `UPTIME_HISTORY_URL` in `status.html`.
- **Analytics**: set `scriptUrl` (and `websiteId` or `domain`) in `js/analytics.js`. It is off until then, and skips visitors with Do Not Track or Global Privacy Control. Name the tool in `privacy.html` when you enable it.

## Local preview

Any static server works, for example:

```bash
python3 -m http.server 8765
```

The directory and status pages call live services (Supabase, Horizon, the homeserver), so they need internet access even locally.

## Things that live elsewhere

- `/.well-known/matrix/*` files are served by the homeserver setup, not from this repo.
- reCAPTCHA on the directory page is checked in the browser only. Verifying it server-side (for example in a Supabase edge function in front of the insert) is the next step if spam submissions become a problem. Also make sure the anon role on `community_ads` cannot update or delete rows.
