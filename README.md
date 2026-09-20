# KW Checker

Personal Chrome extension that shows **SEO and competitive intelligence data on Google results**:

- **Search volume, CPC, competition, 12-month trend** for the query you searched
- **Related keywords table** (top ~20 ideas) with **CSV export**
- Per-result badges on the header row:
  - **Ahrefs Domain Rating (DR)**
  - **Moz Domain Authority (DA)** & Page Authority (PA)
  - **Site Age** (RDAP + WHOIS fallback for ccTLDs/subdomains)
  - **Global Traffic Rank** & PageRank (Open PageRank)
  - **CMS / Framework** (WordPress, Shopify, Next.js, Webflow, etc.)

All data sources are free or offer generous free tiers:

| Data | Source | Cost | Key needed |
|---|---|---|---|
| Volume / CPC / competition / ideas | Google Ads API `generateKeywordIdeas` | free | OAuth + developer token |
| Domain Rating | Ahrefs `v3/public/domain-rating-free` | free | free APIv3 key |
| Site age | RDAP + WHOIS fallback | free | none |
| CMS / Framework | Built-in head/meta detection | free | none |
| Traffic Rank & PageRank | Open PageRank API (Keywords Everywhere) | free (100k calls/mo) | free API key |
| Domain Authority (DA) | Mozscape API v2 | free tier | free Moz token |

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
│   └── service-worker.js      message router; parallel analyze() pipeline
├── lib/
│   ├── settings.js            chrome.storage.local settings
│   ├── cache.js               TTL cache + negative caching (429 backoff)
│   ├── oauth.js               Google OAuth 2.0, auth-code + PKCE via chrome.identity
│   ├── google-ads.js          generateKeywordIdeas REST call (v25, configurable)
│   ├── ahrefs.js              domain-rating-free + 24h cache + 429 backoff
│   ├── rdap.js                subdomain normalization, RDAP + dual WHOIS fallback
│   ├── tech-detect.js         CMS and frontend framework detection
│   ├── traffic-rank.js        Open PageRank API (supports opr_live_ keys)
│   └── moz.js                 Mozscape API v2 for DA and PA
├── content/
│   ├── content.js             SERP widget + result badges + CSV export
│   └── content.css            light/dark styles + color-coded pills
├── popup/                     settings UI with direct links under each field
└── icons/                     high-visibility KW extension icon
```

### Caching

- Keyword metrics: **30 days**
- Traffic Rank: **30 days**
- CMS / Framework: **7 days**
- DR & Moz DA: **24 h**
- Site age: **forever** (registration date never changes)
- Errors/429: negative-cached 5–10 min to avoid rate-limiting
