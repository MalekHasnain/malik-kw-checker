# KW Checker

Personal Chrome extension that shows **Keywords Everywhere-style data on Google results**:

- **Search volume, CPC, competition, 12-month trend** for the query you searched
- **Related keywords table** (top ~20 ideas) with **CSV export**
- Per-result badges: **Ahrefs Domain Rating** + **site age** (RDAP/WHOIS), placed on the header row right after the site name, in solid high-contrast pills (white bold text) with neon glow (DR tier-colored, cyan for age)

All data sources are official and free for personal volumes:

| Data | Source | Cost | Key needed |
|---|---|---|---|
| Volume / CPC / competition / ideas | Google Ads API `generateKeywordIdeas` | free | OAuth + developer token |
| Domain Rating | Ahrefs `v3/public/domain-rating-free` | free | free APIv3 key |
| Site age | RDAP (modern WHOIS) via rdap.org | free | none |

Attribution: Domain Rating by [Ahrefs](https://ahrefs.com/) (license: ahrefs.com/legal/domain-rating-license).

## Install (personal use — no Web Store)

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. **Load unpacked** → select this `kw-checker` folder
4. Open the popup (puzzle icon → KW Checker) and set up credentials — see `CREDENTIALS.md`

## Architecture

```
kw-checker/
├── manifest.json              MV3; content script on Google SERPs (58 TLDs)
├── background/
│   └── service-worker.js      message router; one analyze() call per SERP
├── lib/
│   ├── settings.js            chrome.storage.local settings
│   ├── cache.js               TTL cache + negative caching (429 backoff)
│   ├── oauth.js               Google OAuth 2.0, auth-code + PKCE via chrome.identity
│   ├── google-ads.js          generateKeywordIdeas REST call (v25, configurable)
│   ├── ahrefs.js              domain-rating-free + 24h cache + 429 backoff
│   └── rdap.js                registration date + age formatting
├── content/
│   ├── content.js             SERP widget + result badges + CSV export
│   └── content.css            light/dark styles
├── popup/                     settings UI, connect/test buttons
└── icons/
```

### Caching (why API usage stays tiny)

- Keyword metrics: **30 days** (Google refreshes monthly; the endpoint is rate-limited)
- DR: **24 h** (DR changes slowly)
- Site age: **forever** (registration date never changes)
- Errors/429: negative-cached 30 s–10 min so repeat visits don't hammer APIs

At ~1,000 searches/month this keeps you far inside Google Ads' keyword-planning
rate limits and Ahrefs' 60 req/min public-endpoint limit.

### Known limitations

- **Bucketed volumes**: without ad spend on the linked Ads account, Google returns
  coarse buckets for low-volume keywords (e.g. "0–10"). This is a Google-side
  restriction, same as Keyword Planner itself.
- Basic-access developer token must be **approved** before the Google Ads API
  accepts calls (usually a few days — the popup test button shows the exact error until then).
- Google changes SERP markup occasionally; badge placement may need a selector
  refresh after big redesigns.

## Daily budget

$0/month. All three sources are free within personal-use volumes and license terms.
